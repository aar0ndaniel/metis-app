export type TarkTableFamilyId =
  | 'measurement-model'
  | 'discriminant-validity'
  | 'structural-model'
  | 'explanatory-predictive-power'
  | 'model-fit'
  | 'plspredict'
  | 'ipma'
  | 'nca'
  | 'additional-effects'

export interface TarkTableFamily {
  id: TarkTableFamilyId
  title: string
  description: string
  advanced: boolean
}

export const DEFAULT_TARK_TABLE_FAMILIES: TarkTableFamily[] = [
  {
    id: 'measurement-model',
    title: 'Measurement model assessment',
    description: "Combines indicator loadings, VIF, Cronbach's alpha, rho_A, composite reliability, and AVE.",
    advanced: false,
  },
  {
    id: 'discriminant-validity',
    title: 'Discriminant validity assessment',
    description: 'Groups Fornell-Larcker, HTMT, and HTMT inference as selectable formats under one table family.',
    advanced: false,
  },
  {
    id: 'structural-model',
    title: 'Structural model assessment',
    description: 'Combines hypothesis testing, path coefficients, bootstrapped mean, STDEV, t-values, p-values, confidence intervals, f², effect-size interpretation, and decision.',
    advanced: false,
  },
  {
    id: 'explanatory-predictive-power',
    title: 'Explanatory and predictive power',
    description: 'Combines R², adjusted R², Q², and interpretation labels.',
    advanced: false,
  },
  {
    id: 'model-fit',
    title: 'Model fit assessment',
    description: 'Reports fit indices such as SRMR, d_ULS, d_G, chi-square, and NFI.',
    advanced: false,
  },
]

export const ADVANCED_TARK_TABLE_FAMILIES: TarkTableFamily[] = [
  {
    id: 'plspredict',
    title: 'PLSpredict assessment',
    description: 'Appears only when PLSpredict results are available.',
    advanced: true,
  },
  {
    id: 'ipma',
    title: 'IPMA results',
    description: 'Appears only when IPMA has been run through Advanced analysis.',
    advanced: true,
  },
  {
    id: 'nca',
    title: 'NCA results',
    description: 'Appears only when NCA or cIPMA has been run through Advanced analysis.',
    advanced: true,
  },
  {
    id: 'additional-effects',
    title: 'Additional effects analysis',
    description: 'Includes mediation, moderation, total effects, and specific indirect effects when available.',
    advanced: true,
  },
]

export function getTarkTableFamilies(options: { includeAdvancedAnalysis?: boolean } = {}): TarkTableFamily[] {
  return options.includeAdvancedAnalysis
    ? [...DEFAULT_TARK_TABLE_FAMILIES, ...ADVANCED_TARK_TABLE_FAMILIES]
    : DEFAULT_TARK_TABLE_FAMILIES
}
