export type ResearchCategory =
  | "memory"
  | "retrieval"
  | "context-engineering"
  | "agents"
  | "knowledge"
  | "benchmarks";

export type ResearchStatus =
  | "draft"
  | "experimental"
  | "published"
  | "archived";

export type MetricLabel = string;

export type MetricValue = number | string;

export interface Metric {
  label: MetricLabel;
  value: MetricValue;
  experimental?: true;
  unit?: string;
}

export interface Author {
  name: string;
  affiliation?: string;
}

export interface DatasetInfo {
  name: string;
  size?: number;
  domain?: string;
}

export interface MethodologyBlock {
  dataset?: string;
  questions?: number;
  categories?: number;
  model?: string;
  retrieval?: string;
  evaluation?: string;
  run?: string;
  commit?: string;
}

export interface ResearchResult {
  label?: MetricLabel;
  metric?: MetricLabel;
  value: MetricValue;
  comparison?: MetricValue;
  mejor?: MetricValue; // "best ever" or similar
  unit?: string;
  experimental?: boolean;
}

export interface ResearchItem {
  slug: string;
  number: string;
  category: ResearchCategory;
  title: string;
  description: string;
  abstract?: string;
  authors: Author[];
  publishedAt: string;
  updatedAt?: string;
  status: ResearchStatus;
  featured?: boolean;
  tags: string[];
  readTime?: number;
  subtitle?: string;

  metrics?: Metric[];

  datasets?: DatasetInfo[];

  methodology?: MethodologyBlock;

  results?: ResearchResult[];

  limitations?: string[];

  githubUrl?: string;
  paperUrl?: string | null;
  pdfUrl?: string | null;

  references?: string[];

  experimentalNotes?: string[] | string;
}

export interface ResearchFilter {
  category?: ResearchCategory | "all";
  status?: ResearchStatus | "all";
  sort?: "latest" | "oldest" | "featured" | "most-relevant";
}

export interface ResearchSection {
  id: string;
  title: string;
  description?: string;
}

export type ResearchMetadata = {
  title: string;
  description: string;
  keywords: string[];
};

export interface ResearchAPIDefinition {
  getResearch: () => Promise<ResearchItem[]>;
  getResearchBySlug: (slug: string) => Promise<ResearchItem | null>;
  getResearchCategories: () => Promise<ResearchCategory[]>;
}

// SEO types
export interface ResearchSEOMetadata {
  title: string;
  description: string;
  canonical: string;
  openGraph: {
    title: string;
    description: string;
    images: Array<{ url: string; alt: string }>;
    type: string;
    siteName: string;
  };
  twitter: {
    title: string;
    description: string;
    images: string;
    card: string;
  };
}
