import { dataService } from './data.service';
import { pickN } from '../utils/rarity';
import type { Driver, Constructor } from '../types';

const SHOP_DRIVER_SLOTS = 5;
const SHOP_CONSTRUCTOR_SLOTS = 3;

export const shopService = {
  // Generates a fresh shop offer excluding entities the user already owns.
  // Drivers are weighted by price (higher price = rarer). Constructors weighted similarly.
  async rollOffer(opts: {
    excludeDriverIds: string[];
    excludeConstructorIds: string[];
  }): Promise<{ drivers: Driver[]; constructors: Constructor[] }> {
    const [allDrivers, allConstructors] = await Promise.all([
      dataService.getActiveDrivers(),
      dataService.getActiveConstructors(),
    ]);

    const driverPool = allDrivers.filter((d) => !opts.excludeDriverIds.includes(d.id));
    const constructorPool = allConstructors.filter((c) => !opts.excludeConstructorIds.includes(c.id));

    // Inverse weighting: cheaper drivers more common, expensive ones rarer.
    // We do straight price-weighted selection, which biases toward expensive — flip to invert.
    // Use (maxPrice - price + 1) to favor cheaper.
    const maxDriverPrice = Math.max(...allDrivers.map((d) => d.price), 1);
    const maxConstructorPrice = Math.max(...allConstructors.map((c) => c.price), 1);

    const drivers = pickN(driverPool, SHOP_DRIVER_SLOTS, (d) => maxDriverPrice - d.price + 5);
    const constructors = pickN(constructorPool, SHOP_CONSTRUCTOR_SLOTS, (c) => maxConstructorPrice - c.price + 5);

    return { drivers, constructors };
  },
};

export const shopConfig = { SHOP_DRIVER_SLOTS, SHOP_CONSTRUCTOR_SLOTS };
