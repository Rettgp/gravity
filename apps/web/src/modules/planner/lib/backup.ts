import type { CollectionName, Item, Settings, YearData, YearSummary } from '../data/PlannerContext'

type BackupFile = {
  app: 'christmas-planner'
  version: 1
  exportedAt: string
  years: YearData[]
}

export async function exportBackup(planner: { years: YearSummary[]; fetchYear: (y: number) => Promise<YearData> }) {
  const years: YearData[] = []
  for (const y of planner.years) years.push(await planner.fetchYear(y.year))
  const payload: BackupFile = { app: 'christmas-planner', version: 1, exportedAt: new Date().toISOString(), years }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const stamp = new Date().toISOString().slice(0, 10)
  downloadBlob(blob, `christmas-planner-backup-${stamp}.json`)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function readBackupFile(file: File): Promise<YearData[]> {
  const text = await file.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (data?.app !== 'christmas-planner' || !Array.isArray(data.years)) {
    throw new Error('That file is not a Christmas Planner backup.')
  }
  return data.years.map((y: any) => {
    const year = Number(y.year)
    if (!(year >= 2000 && year <= 2100)) throw new Error('Backup contains an invalid year.')
    return {
      year,
      settings: (y.settings ?? {}) as Settings,
      collections: (y.collections ?? {}) as Partial<Record<CollectionName, Item[]>>,
    }
  })
}
