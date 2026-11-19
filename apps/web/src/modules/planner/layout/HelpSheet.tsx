import { Sheet } from '../components/Sheet'

const TIPS: [string, string][] = [
  ['Start with Planner Setup', 'Pick your name, Christmas year, currency and an intention for the season. Each Christmas year keeps its own separate planner.'],
  ['Add anything with the plus button', 'Every section has an add button (bottom-right on your phone). Tap any card to edit or delete it.'],
  ['Tap to update, tap tiles to expand', 'Gifts are compact tiles — tap one to enlarge it, toggle Purchased, Wrapped, Present, Stocking Stuffer or Family Gift, and tap outside to shrink it again. Circles mark to-dos and lists as done.'],
  ['Budget ties it together', 'Set category budgets, log expenses, and link categories to your gift, shopping or decoration spending to see planned vs. actual.'],
  ['Meals & groceries', 'Plan breakfast, lunch, dinner and more for Christmas Eve and Christmas Day, save your own recipes and send their ingredients straight to the food-only grocery list.'],
  ['Shared household', 'Everyone on the guest list sees the same planner. Changes save automatically and show “All changes saved”.'],
  ['Backup, restore & PDF', 'Backup downloads every year as a file you can restore later. PDF Export opens a printable summary.'],
]

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to use" subtitle="Your Christmas, beautifully organized.">
      <ol className="help-list">
        {TIPS.map(([t, d], i) => (
          <li key={t}>
            <span className="help-num">{i + 1}</span>
            <div>
              <strong>{t}</strong>
              <p className="muted small">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </Sheet>
  )
}
