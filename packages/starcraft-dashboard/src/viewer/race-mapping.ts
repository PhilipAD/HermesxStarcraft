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
