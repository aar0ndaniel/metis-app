import type { MeasurementType, RunPlsConstruct, RunPlsInteraction, RunPlsPath } from '../services/plsApi'

export type HocPathRole = 'measurement' | 'structural'

interface PlsCanvasIndicatorLike {
  name: string
}

export interface PlsCanvasConstructLike {
  id: string
  name: string
  type: MeasurementType
  indicators?: PlsCanvasIndicatorLike[]
  isHigherOrder?: boolean
}

export interface PlsCanvasPathLike {
  id?: string
  from: string
  to: string
  kind?: 'direct' | 'moderation'
  targetPathId?: string
  hocRole?: HocPathRole
}

export interface PlsModelPayloadParts {
  constructs: RunPlsConstruct[]
  paths: RunPlsPath[]
  interactions: RunPlsInteraction[]
  directPathCount: number
  hocDimensionsById: Map<string, string[]>
}

function isHocMeasurementLink(
  path: PlsCanvasPathLike,
  constructById: Map<string, PlsCanvasConstructLike>,
): boolean {
  if (path.kind === 'moderation') return false
  const from = constructById.get(path.from)
  const to = constructById.get(path.to)
  if (!from || !to) return false
  if (Boolean(from.isHigherOrder) === Boolean(to.isHigherOrder)) return false
  return path.hocRole !== 'structural'
}

function addHocDimension(dimensions: Map<string, string[]>, hocId: string, locName: string) {
  const current = dimensions.get(hocId) ?? []
  if (!current.includes(locName)) current.push(locName)
  dimensions.set(hocId, current)
}

export function buildPlsModelPayloadParts(
  constructs: PlsCanvasConstructLike[],
  paths: PlsCanvasPathLike[],
): PlsModelPayloadParts {
  const constructById = new Map(constructs.map((construct) => [construct.id, construct]))
  const constructNameById = new Map(constructs.map((construct) => [construct.id, construct.name]))
  const hocDimensionsById = new Map<string, string[]>()

  const directPaths = paths.filter((path) => path.kind !== 'moderation')
  const structuralDirectPaths: PlsCanvasPathLike[] = []

  directPaths.forEach((path) => {
    const from = constructById.get(path.from)
    const to = constructById.get(path.to)
    if (!from || !to) return

    if (isHocMeasurementLink(path, constructById)) {
      const hoc = from.isHigherOrder ? from : to
      const loc = from.isHigherOrder ? to : from
      addHocDimension(hocDimensionsById, hoc.id, loc.name)
      return
    }

    structuralDirectPaths.push(path)
  })

  const mappedDirectPaths = structuralDirectPaths
    .map((path) => ({
      from: constructNameById.get(path.from) || path.from,
      to: constructNameById.get(path.to) || path.to,
    }))
    .filter((path) => !!path.from && !!path.to && path.from !== path.to)

  const interactionRows: RunPlsInteraction[] = []
  const moderationMainEffectPaths: RunPlsPath[] = []
  const interactionStructuralPaths: RunPlsPath[] = []
  const seenInteractions = new Set<string>()
  const seenStructuralPaths = new Set(mappedDirectPaths.map((path) => `${path.from}|${path.to}`))

  paths
    .filter((path) => path.kind === 'moderation')
    .forEach((moderationPath) => {
      const targetPath =
        (moderationPath.targetPathId != null
          ? structuralDirectPaths.find((path) => String(path.id) === String(moderationPath.targetPathId))
          : undefined) ??
        structuralDirectPaths.find((path) => path.to === moderationPath.to && path.from !== moderationPath.from)
      if (!targetPath) return

      const iv = constructNameById.get(targetPath.from) || targetPath.from
      const moderator = constructNameById.get(moderationPath.from) || moderationPath.from
      const outcome = constructNameById.get(targetPath.to) || targetPath.to || constructNameById.get(moderationPath.to) || moderationPath.to
      if (!iv || !moderator || !outcome) return
      if (iv === moderator || iv === outcome || moderator === outcome) return

      const key = `${iv}|${moderator}|${outcome}`
      if (seenInteractions.has(key)) return
      seenInteractions.add(key)

      interactionRows.push({ iv, moderator, outcome })

      const moderatorPathKey = `${moderator}|${outcome}`
      if (!seenStructuralPaths.has(moderatorPathKey)) {
        moderationMainEffectPaths.push({ from: moderator, to: outcome })
        seenStructuralPaths.add(moderatorPathKey)
      }

      const interactionPath = { from: `${iv}*${moderator}`, to: outcome }
      const interactionPathKey = `${interactionPath.from}|${interactionPath.to}`
      if (!seenStructuralPaths.has(interactionPathKey)) {
        interactionStructuralPaths.push(interactionPath)
        seenStructuralPaths.add(interactionPathKey)
      }
    })

  const payloadConstructs = constructs
    .map((construct) => {
      const indicators = (construct.indicators ?? []).map((indicator) => indicator.name).filter(Boolean)
      if (!construct.isHigherOrder) {
        return {
          name: construct.name,
          type: construct.type,
          indicators,
        }
      }

      return {
        name: construct.name,
        type: construct.type,
        indicators,
        is_higher_order: true,
        higher_order_type: construct.type.toLowerCase() as 'reflective' | 'formative',
        dimensions: hocDimensionsById.get(construct.id) ?? [],
      }
    })
    .filter((construct) => construct.is_higher_order || construct.indicators.length > 0)

  return {
    constructs: payloadConstructs,
    paths: [...mappedDirectPaths, ...moderationMainEffectPaths, ...interactionStructuralPaths],
    interactions: interactionRows,
    directPathCount: mappedDirectPaths.length,
    hocDimensionsById,
  }
}
