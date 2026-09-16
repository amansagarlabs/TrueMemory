import { Metadata } from "next";
import Link from "next/link";
import type { ResearchItem } from "@/lib/research-types";
import { researchItems } from "@/data/research-data";
import { Loader2 } from "lucide-react";
import {
  ExperimentStatusBadge,
  StatusTag,
  MethodologyBlockDisplay,
  ResultsTable,
} from "@/components/research";

/**
 * Get research item by slug
 */
function getResearchItem(slug: string): ResearchItem | null {
  const item = researchItems.find((i) => i.slug === slug);
  return item || null;
}

/**
 * Generate metadata for research detail pages
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = getResearchItem(slug);

  if (!item) {
    return {
      title: "Research not found | TrueMemory Research",
      description: "Research paper not found",
    };
  }

  return {
    title: `${item.title} | TrueMemory Research`,
    description: item.abstract || item.description,
    keywords: item.tags.join(", "),
    openGraph: {
      title: item.title,
      description: item.abstract || item.description,
      images: item.pdfUrl
        ? [{ url: item.pdfUrl, alt: item.title }]
        : item.paperUrl
        ? [{ url: item.paperUrl, alt: item.title }]
        : undefined,
      type: "article",
    },
    twitter: {
      title: item.title,
      description: item.abstract || item.description,
      images: item.pdfUrl || item.paperUrl || "/research-social.png",
      card: "summary_large_image",
    },
  };
}

/**
 * ResearchDetailPage - Individual research paper page
 */
export default async function ResearchDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = getResearchItem(slug);

  if (!item) {
    return (
      <main className="min-h-screen bg-[#f7f2eb] text-[#201510]">
        <div className="mx-auto w-full max-w-[1440px] px-5 py-12 sm:px-8 lg:px-10 text-center">
          <Loader2 className="size-6 mx-auto mb-4 animate-spin" aria-hidden="true" />
          <h2 className="text-3xl font-semibold text-[#34251e] dark:text-white/85">
            Research not found
          </h2>
          <p className="mt-4 text-base text-[#786a60] dark:text-white/55">
            The research paper &quot;{slug}&quot; could not be found.
          </p>
          <Link
            href="/research"
            className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#171814] px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#2b2e28] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] dark:bg-[#f2f1e8] dark:text-[#171814] dark:hover:bg-[#e4e3da]"
          >
            ← Back to research
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f2eb] text-[#201510]">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-12 sm:px-8 lg:px-10 lg:py-10">
        <nav className="flex flex-col sm:flex-row items-center gap-4 mb-8">
          <Link
            href="/research"
            className="text-[10px] uppercase tracking-[0.16em] text-[#938377] dark:text-white/38 flex items-center gap-1.5"
          >
            ← Back to research
          </Link>

          <ExperimentStatusBadge status={item.status} />
        </nav>

        <article className="prose lg:prose-xl max-w-none text-[#34251e] dark:text-white/90">
          <header className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
              <div>
                <span className="text-[9px] uppercase tracking-[0.12em]">
                  {item.number}
                </span>
                <h1 className="text-5xl font-bold tracking-[-0.05em] sm:text-6xl lg:text-7xl">
                  {item.title}
                </h1>
              </div>

              <div>
                <StatusTag status={item.status} />
                {item.featured && (
                  <span
                    className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-[#e67d2b] px-2 py-0.5 text-[8px] uppercase tracking-[0.06em] text-white"
                  >
                    Featured
                  </span>
                )}
              </div>
            </div>

            {item.subtitle && (
              <p className="mt-2 text-lg text-[#737373] dark:text-white/45">{item.subtitle}</p>
            )}
          </header>

          {/* Abstract */}
          {item.abstract && (
            <section className="mb-8">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#34251e] dark:text-white/90 mb-3">
                Abstract
              </h2>
              <p className="text-base leading-relaxed dark:text-white/55 line-clamp-5">
                {item.abstract}
              </p>
            </section>
          )}

          {/* Key findings */}
          {item.results && item.results.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#34251e] dark:text-white/90 mb-4">
                Key findings
              </h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {item.results.map((result, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl border border-[#e5d8c9] bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="text-4xl font-bold">
                      {typeof result.value === "number"
                        ? Math.round(result.value)
                        : result.value}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-[#34251e] dark:text-white/85">
                        {result.label}
                      </span>
                      {result.unit && (
                        <span className="text-[9px] text-[#737373] dark:text-white/38">
                          {result.unit}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Problem */}
          {item.methodology && (
            <section className="mb-8">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#34251e] dark:text-white/90 mb-4">
                Problem
              </h2>
              <p className="text-base leading-relaxed text-[#737373] dark:text-white/55 line-clamp-4">
                {item.methodology.dataset
                  ? `Using the ${item.methodology.dataset} dataset with ${
                      item.methodology.questions
                    } questions across ${item.methodology.categories} categories.`
                  : "The research problem investigated in this work."}
              </p>
            </section>
          )}

          {/* Methodology */}
          {item.methodology && (
            <section className="mb-8">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#34251e] dark:text-white/90 mb-4">
                Methodology
              </h2>
              <MethodologyBlockDisplay methodology={item.methodology} />
            </section>
          )}

          {/* Results */}
          {item.results && item.results.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#34251e] dark:text-white/90 mb-4">
                Results
              </h2>
              <ResultsTable results={item.results} />
            </section>
          )}

          {/* Analysis */}
          {item.limitations && item.limitations.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#34251e] dark:text-white/90 mb-4">
                Analysis
              </h2>
              <p className="text-base leading-relaxed text-[#737373] dark:text-white/55">
                {item.results && item.results.length > 0
                  ? `The results${item.results.length > 0 ? "" : ""} demonstrate`
                  : ""}
                ${item.limitations
                  .slice(0, 3)
                  .map(
                    (lim, i) => `${i + 1}. ${lim}`,
                  )
                  .join(". ")}.
              </p>
            </section>
          )}

          {/* Limitations */}
          {item.limitations && item.limitations.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#34251e] dark:text-white/90 mb-4">
                Limitations
              </h2>
              <ul className="space-y-3 text-base leading-relaxed text-[#737373] dark:text-white/55">
                {item.limitations.map((lim, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[9px] uppercase tracking-[0.08em] text-[#e67d2b] flex-shrink-0">
                      {i + 1}.
                    </span>
                    <span className="flex-1">{lim}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Reproduction */}
          {item.githubUrl && (
            <section className="mb-8">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#34251e] dark:text-white/90 mb-4">
                Reproduction
              </h2>
              <p className="text-base leading-relaxed text-[#737373] dark:text-white/55">
                View the source code and experiment configuration:
              </p>
              <div className="mt-3">
                <a
                  href={item.githubUrl}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#e67d2b] px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#b84d0d] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] dark:bg-[#b84d0d] dark:text-white active:bg-[#9a691c]"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View research code on GitHub
                </a>
                {item.pdfUrl && (
                  <a
                    href={item.pdfUrl}
                    className="ml-4 inline-flex items-center gap-1.5 rounded-xl bg-white/70 px-4 py-2 text-sm font-medium text-[#6f6258] transition-[background-color,color,transform] duration-150 hover:bg-white hover:text-[#201510] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] dark:bg-white/[0.03] dark:text-white/55 dark:hover:bg-white/[0.07] dark:hover:text-white"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download PDF →
                  </a>
                )}
                {item.paperUrl && (
                  <a
                    href={item.paperUrl}
                    className="ml-4 inline-flex items-center gap-1.5 rounded-xl bg-white/70 px-4 py-2 text-sm font-medium text-[#6f6258] transition-[background-color,color,transform] duration-150 hover:bg-white hover:text-[#201510] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e67d2b] dark:bg-white/[0.03] dark:text-white/55 dark:hover:bg-white/[0.07] dark:hover:text-white"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Read paper →
                  </a>
                )}
              </div>
            </section>
          )}

          {/* References */}
          {item.references && item.references.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#34251e] dark:text-white/90 mb-4">
                References
              </h2>
              <ul className="space-y-3 text-base leading-relaxed text-[#737373] dark:text-white/55">
                {item.references.map((ref, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-[9px] uppercase tracking-[0.06em] text-[#e67d2b]">
                      {i + 1}.
                    </span>
                    <span className="flex-1">{ref}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </div>
    </main>
  );
}
