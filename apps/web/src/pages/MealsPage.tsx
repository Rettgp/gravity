import { useSearchParams } from 'react-router-dom';
import { GroceryTab } from '../modules/meals/GroceryTab';
import { PlanTab } from '../modules/meals/PlanTab';
import { RecipesTab } from '../modules/meals/RecipesTab';

const TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'grocery', label: 'Grocery' },
  { id: 'recipes', label: 'Recipes' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function MealsPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: Tab = TABS.some((t) => t.id === asked) ? (asked as Tab) : 'plan';

  return (
    <div className="page">
      <header className="page-head">
        <p className="muted">What are we eating, and what do we need?</p>
        <h1>Meal plan</h1>
      </header>
      <div className="jr-tabs ml-tabs" role="tablist" aria-label="Meal plan sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={'jr-tab' + (tab === t.id ? ' on' : '')} onClick={() => setParams(t.id === 'plan' ? {} : { tab: t.id }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'plan' && <PlanTab />}
      {tab === 'grocery' && <GroceryTab />}
      {tab === 'recipes' && <RecipesTab />}
    </div>
  );
}
