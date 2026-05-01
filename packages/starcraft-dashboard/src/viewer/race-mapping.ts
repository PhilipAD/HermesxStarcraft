/**
 * Per-race StarCraft scType remapping.
 *
 * The dashboard's EntityMapper always emits entities using Terran scTypes
 * (Marine, SCV, Refinery, Barracks, etc.). When the user picks Zerg or
 * Protoss, the viewer rewrites those scTypes to the equivalent unit /
 * building for that race before sending the entity batch into the Titan
 * iframe. Keeping the rewrite table here (instead of inline in the React
 * component) lets tests verify that live entity additions correctly produce
 * the right race-specific spawn type.
 */

export type StarCraftRace = 'terran' | 'zerg' | 'protoss'

export interface RaceMappableEntity {
  scType: string
  tier?: number
}

export const raceScTypeProfiles: Record<StarCraftRace, Record<string, string>> = {
  terran: {},
  zerg: {
    CommandCenter: 'Hatchery',
    Refinery: 'Extractor',
    SCV: 'Drone',
    SupplyDepot: 'Overlord',
    Barracks: 'SpawningPool',
    Marine: 'Zergling',
    Firebat: 'Hydralisk',
    Ghost: 'Defiler',
    Factory: 'EvolutionChamber',
    Starport: 'Spire',
    Academy: 'HydraliskDen',
    EngineeringBay: 'EvolutionChamber',
    Armory: 'UltraliskCavern',
    ScienceFacility: 'DefilerMound',
    ComsatStation: 'Overlord',
    ControlTower: 'NydusCanal',
    MachineShop: 'QueensNest',
    CovertOps: 'DefilerMound',
    PhysicsLab: 'GreaterSpire',
    Bunker: 'SunkenColony',
    MissileTurret: 'SporeColony',
    Dropship: 'Mutalisk',
    ScienceVessel: 'Defiler',
  },
  protoss: {
    CommandCenter: 'Nexus',
    Refinery: 'Assimilator',
    SCV: 'Probe',
    SupplyDepot: 'Pylon',
    Barracks: 'Gateway',
    Marine: 'Zealot',
    Firebat: 'Dragoon',
    Ghost: 'DarkTemplar',
    Factory: 'RoboticsFacility',
    Starport: 'Stargate',
    Academy: 'TemplarArchives',
    EngineeringBay: 'Forge',
    Armory: 'CyberneticsCore',
    ScienceFacility: 'Observatory',
    ComsatStation: 'Observer',
    ControlTower: 'FleetBeacon',
    MachineShop: 'RoboticsSupportBay',
    CovertOps: 'TemplarArchives',
    PhysicsLab: 'ArbiterTribunal',
    Bunker: 'ShieldBattery',
    MissileTurret: 'PhotonCannon',
    Dropship: 'Shuttle',
    ScienceVessel: 'Observer',
  },
}

export const coreByRaceTier: Record<Exclude<StarCraftRace, 'terran'>, string[]> = {
  zerg: ['Hatchery', 'Lair', 'Hive'],
  protoss: ['Nexus', 'Nexus', 'Nexus'],
}

export function scTypeForRace(entity: RaceMappableEntity, race: StarCraftRace): string {
  if (race === 'terran') return entity.scType
  if (entity.scType === 'CommandCenter') {
    const core = coreByRaceTier[race]
    const tier = Math.max(0, Math.min(core.length - 1, (entity.tier || 1) - 1))
    return core[tier]
  }
  return raceScTypeProfiles[race][entity.scType] ?? entity.scType
}

/**
 * UI label for the mapper's internal Terran scType, using the same mapping as
 * the Titan bridge for the selected race, then spacing CamelCase for display.
 */
export function prettifyScTypeId(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
}

export function displayScTypeName(
  internalTerranScType: string,
  race: StarCraftRace,
  tier?: number,
): string {
  const mapped = scTypeForRace({ scType: internalTerranScType, tier }, race)
  return prettifyScTypeId(mapped)
}
