import { dataService } from './data.service';
import type { Driver, Constructor } from '../types';

export const shopService = {
  // Full catalog: every active driver/constructor the user doesn't own, all
  // buyable, priciest first. Replaced the 5-slot random offer + paid reroll
  // in 0.1.30 — players couldn't see what non-offered drivers cost.
  async getCatalog(opts: {
    excludeDriverIds: string[];
    excludeConstructorIds: string[];
  }): Promise<{ drivers: Driver[]; constructors: Constructor[] }> {
    const [allDrivers, allConstructors] = await Promise.all([
      dataService.getActiveDrivers(),
      dataService.getActiveConstructors(),
    ]);

    const drivers = allDrivers
      .filter((d) => !opts.excludeDriverIds.includes(d.id))
      .sort((a, b) => b.price - a.price);
    const constructors = allConstructors
      .filter((c) => !opts.excludeConstructorIds.includes(c.id))
      .sort((a, b) => b.price - a.price);

    return { drivers, constructors };
  },
};
