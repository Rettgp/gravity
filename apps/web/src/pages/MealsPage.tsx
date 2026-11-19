import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GroceryTab } from '../modules/meals/GroceryTab';
import { PlanTab } from '../modules/meals/PlanTab';
import { RecipesTab } from '../modules/meals/RecipesTab';

const TABS = ['plan', 'grocery', 'recipes'] as const;
type Tab = (typeof TABS)[number];

/** The Plan / Grocery / Recipes switch lives in the shell sidebar (a drawer on phones), driven by ?tab=. */
export function MealsPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: Tab = TABS.includes(asked as Tab) ? (asked as Tab) : 'plan';
  // Keep the URL explicit so the active section is highlighted in the navigation.
  useEffect(() => {
    if (asked !== tab) setParams({ tab }, { replace: true });
  }, [asked, tab, setParams]);

  return (
    <div className="page">
      <header className="page-head">
        <p className="muted">What are we eating, and what do we need?</p>
        <h1>Meal plan</h1>
      </header>
      {tab === 'plan' && <PlanTab />}
      {tab === 'grocery' && <GroceryTab />}
      {tab === 'recipes' && <RecipesTab />}
    </div>
  );
}
