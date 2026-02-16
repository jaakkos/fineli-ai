import { FineliClient } from './client';
import { portionConverter } from './portions';

export const fineliClient = new FineliClient({ defaultLang: 'fi' });

export { portionConverter };

// Re-export local index utilities for convenience
export {
  localSearch,
  searchFoods,
  getFoodDetails,
  findWholeDish,
  getRecipe,
  getPortionSizes,
  getMediumPortion,
  getFoodMeta,
  isDish,
} from './local-index';
