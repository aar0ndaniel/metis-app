export interface RecentModel {
  id: string
  name: string
  wsId?: string
  wsName?: string
}

export function addRecentModel(model: RecentModel) {
  try {
    const stored = localStorage.getItem('metis:recentModels')
    let models: RecentModel[] = stored ? JSON.parse(stored) : []

    // Deduplicate: Remove if exists
    models = models.filter((m) => m.id !== model.id)
    
    // Push to front (store model-focused label)
    models.unshift({
      id: model.id,
      name: model.name,
    })
    
    // Cap at 10 items
    if (models.length > 10) {
      models = models.slice(0, 10)
    }

    localStorage.setItem('metis:recentModels', JSON.stringify(models))
  } catch (e) {
    console.error('Failed to update recent models:', e)
  }
}
