import { Check, ChevronDown, ExternalLink, Search } from "lucide-react";
import type { QuerySource } from "@/lib/types";

const GLOBE_PATHS = {
  left: "M6.057 11.565C2.081 11.565.371 8.159.371 5.964.371 3.642 2.152.329 6.05.329",
  middleLeft: "M6.012 11.55C4.575 10.496 3.333 8.116 3.321 5.964 3.307 3.399 4.974.977 6.012.329",
  middleRight: "M6.012 11.55C7.211 10.781 8.715 8.287 8.715 5.964 8.715 3.399 7.24 1.233 6.012.329",
  right: "M6.012 11.55C9.677 11.55 11.65 8.487 11.65 5.964 11.65 3.499 9.748.329 6.012.329",
};

function RotatingGlobe() {
  const values = [GLOBE_PATHS.left, GLOBE_PATHS.middleLeft, GLOBE_PATHS.middleRight, GLOBE_PATHS.right, GLOBE_PATHS.left].join(";");
  return (
    <svg className="web-search-meridian-globe" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="0.85" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="6" r="5.7" />
      <path d="M.3 6h11.4" />
      {["0s", "-1.2s", "-2.4s", "-3.6s", "-4.8s", "-6s"].map((begin) => (
        <path key={begin} d={GLOBE_PATHS.left} opacity="0">
          <animate attributeName="d" dur="7.2s" begin={begin} repeatCount="indefinite" values={values} />
          <animate attributeName="opacity" dur="7.2s" begin={begin} repeatCount="indefinite" keyTimes="0;0.05;0.7;0.75;1" values="0;0.9;0.9;0;0" />
        </path>
      ))}
    </svg>
  );
}

function isPublicWebSource(source: QuerySource) {
  return (
    ["search", "scrape", "crawl"].includes(source.source_type) &&
    /^https?:\/\//i.test(source.url) &&
    source.domain.toLowerCase() !== "curated knowledge base"
  );
}

export function WebSearchState({
  query,
  sources,
  active = true,
  defaultOpen = true,
}: {
  query?: string;
  sources: QuerySource[];
  active?: boolean;
  defaultOpen?: boolean;
}) {
  const visibleSources = sources.filter(isPublicWebSource).slice(0, 4);
  return (
    <details className="web-search-state" open={defaultOpen}>
      <summary className="web-search-header">
        <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        <span className={active ? "web-search-shimmer" : "web-search-label"}>
          {active ? "Searching" : "Searched"}{query ? <span className="web-search-query"> &quot;{query}&quot;</span> : null}
        </span>
        <span className="web-search-count">{visibleSources.length ? `${visibleSources.length} found` : null}</span>
        <ChevronDown className="web-search-chevron" strokeWidth={1.8} aria-hidden="true" />
      </summary>
      <div className="web-search-collapsible">
        <div className="web-search-results">
          <span className="web-search-rail" aria-hidden="true" />
          <ul className="web-search-list" aria-label="Web sources">
            {visibleSources.map((source, index) => {
              const isLoading = active && index === visibleSources.length - 1;
              return (
                <li key={source.id || source.url} className="web-search-source" data-state={isLoading ? "loading" : "done"}>
                  <span className="web-search-bullet" aria-hidden="true">
                    {isLoading ? <RotatingGlobe /> : <Check className="web-search-check" strokeWidth={1.8} />}
                  </span>
                  <span className="web-search-copy">
                    <span className="web-search-title">{source.title || source.domain}</span>
                    <span className="web-search-domain">{source.domain}</span>
                  </span>
                  <a className="web-search-link" href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.title || source.domain}`}>
                    <ExternalLink className="size-3.5" strokeWidth={1.8} />
                  </a>
                </li>
              );
            })}
            {!visibleSources.length ? (
              <li className="web-search-empty">
                <span className="web-search-orbit" aria-hidden="true"><RotatingGlobe /></span>
                <span><strong>Finding reliable sources</strong><small>Checking the open web for relevant evidence</small></span>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </details>
  );
}
