export type FilterGroupKey = string;

export type FilterGroupLayout = "boolean-grid" | "target-selector" | "option-list";

export interface FilterGroupDefinition {
  readonly key: FilterGroupKey;
  readonly label: string;
  readonly layout: FilterGroupLayout;
  readonly description?: string;
}

export type FilterVariant = "boolean" | "categorical";

export interface FilterOption {
  readonly value: string;
  readonly label: string;
  readonly slug?: string;
}

export interface FilterDefinitionBase {
  readonly key: string;
  readonly slug: string;
  readonly label: string;
  readonly group: FilterGroupKey;
  readonly description?: string;
  readonly featureId?: string;
  readonly featureName?: string;
  readonly featureSlug?: string;
  readonly featureRelation?: string;
  readonly detailType?: string | null;
  readonly detailLabel?: string | null;
  readonly detailRelation?: string | null;
  readonly parentSlug?: string;
  readonly path?: readonly string[];
}

export interface BooleanFilterDefinition extends FilterDefinitionBase {
  readonly variant: "boolean";
  readonly positiveValue?: string;
}

export interface CategoricalFilterDefinition extends FilterDefinitionBase {
  readonly variant: "categorical";
  readonly options: readonly FilterOption[];
}

export type FilterDefinition = BooleanFilterDefinition | CategoricalFilterDefinition;

export interface DatasetFilterMetadata {
  readonly groups: readonly FilterGroupDefinition[];
  readonly filters: readonly FilterDefinition[];
}

export type AppliedFilterCondition = "IGUAL" | "DIFERENTE";

export interface AppliedFilter {
  readonly slug: string;
  readonly value: string;
  readonly condition: AppliedFilterCondition;
}

export interface CandidateRecord {
  readonly id: string;
  readonly nome?: string;
  readonly label?: string;
  readonly slug?: string;
  readonly properties: Record<string, unknown>;
}

export type Pessoa = CandidateRecord;

export const isBooleanFilterDefinition = (
  filter: FilterDefinition,
): filter is BooleanFilterDefinition => filter.variant === "boolean";

export const isCategoricalFilterDefinition = (
  filter: FilterDefinition,
): filter is CategoricalFilterDefinition => filter.variant === "categorical";

export const splitFilterSlug = (
  slug: string,
): { featureSlug: string; detailType: string | null } => {
  if (typeof slug !== "string") {
    return { featureSlug: "", detailType: null };
  }
  const parts = slug
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length >= 2) {
    return { featureSlug: parts[0] ?? slug, detailType: parts[1] ?? null };
  }
  return { featureSlug: parts[0] ?? slug, detailType: null };
};

export const extractFeatureLabel = (filter: FilterDefinition): string => {
  const baseName = typeof filter.featureName === "string" ? filter.featureName.trim() : "";
  if (baseName) {
    return baseName;
  }
  const [firstPart] = filter.label.split("•");
  return firstPart ? firstPart.trim() : filter.label;
};

export type FeatureDetailTreeNode = {
  key: string;
  path: readonly string[];
  segment: string;
  label: string;
  relation?: string | null;
  filter?: CategoricalFilterDefinition;
  children: FeatureDetailTreeNode[];
};

export type FeatureTreeNode = {
  key: string;
  slug: string;
  label: string;
  featureRelation?: string;
  group: FilterGroupKey;
  booleanFilter?: BooleanFilterDefinition;
  detailTree: FeatureDetailTreeNode[];
  detailNodeLookup: Map<string, FeatureDetailTreeNode>;
};
