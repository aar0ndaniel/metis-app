export const MICOM_HOC_UNAVAILABLE_MESSAGE =
  'MICOM is currently not available for models containing higher-order constructs. Run MICOM on a model without higher-order constructs.'

export interface HigherOrderConstructLike {
  isHigherOrder?: boolean
  is_higher_order?: boolean
}

export function containsHigherOrderConstruct(
  constructs: readonly HigherOrderConstructLike[] | null | undefined,
): boolean {
  return Array.isArray(constructs) && constructs.some((construct) => (
    construct?.isHigherOrder === true || construct?.is_higher_order === true
  ))
}
