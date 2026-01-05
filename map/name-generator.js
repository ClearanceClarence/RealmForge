/**
 * Procedural Name Generator for Fantasy Maps
 * Generates unique names for kingdoms, counties, cities, regions, etc.
 */

export class NameGenerator {
    constructor(seed = Date.now()) {
        this.seed = seed;
        this.usedNames = new Set();
    }
    
    /**
     * Reset used names (call when generating a new map)
     */
    reset() {
        this.usedNames.clear();
    }
    
    /**
     * Simple seeded random number generator
     */
    _random() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    
    /**
     * Pick random element from array
     */
    _pick(arr) {
        return arr[Math.floor(this._random() * arr.length)];
    }
    
    /**
     * Generate multiple unique names of a given type
     */
    generateNames(count, type = 'kingdom') {
        const names = [];
        
        for (let i = 0; i < count; i++) {
            let name;
            let attempts = 0;
            
            do {
                name = this._generateName(type);
                attempts++;
            } while (this.usedNames.has(name.toLowerCase()) && attempts < 100);
            
            this.usedNames.add(name.toLowerCase());
            names.push(name);
        }
        
        return names;
    }
    
    /**
     * Generate a single name based on type
     */
    _generateName(type) {
        switch (type) {
            case 'kingdom':
                return this._generateKingdomName();
            case 'county':
                return this._generateCountyName();
            case 'city':
                return this._generateCityName();
            case 'region':
                return this._generateRegionName();
            case 'river':
                return this._generateRiverName();
            case 'mountain':
                return this._generateMountainName();
            case 'forest':
                return this._generateForestName();
            case 'sea':
                return this._generateSeaName();
            default:
                return this._generateKingdomName();
        }
    }
    
    // ========================================
    // PHONEME DEFINITIONS
    // ========================================
    
    get vowels() {
        return ['a', 'e', 'i', 'o', 'u'];
    }
    
    get softVowels() {
        return ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'au', 'ea', 'ei', 'ia', 'io', 'ou', 'oe', 'y'];
    }
    
    get hardConsonants() {
        return ['b', 'c', 'd', 'g', 'k', 'p', 't', 'v', 'z'];
    }
    
    get softConsonants() {
        return ['f', 'h', 'l', 'm', 'n', 'r', 's', 'w', 'y'];
    }
    
    get allConsonants() {
        return [...this.hardConsonants, ...this.softConsonants];
    }
    
    get blends() {
        return ['bl', 'br', 'ch', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'ph', 'pl', 'pr', 
                'sh', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'str', 'sw', 'th', 'tr', 'tw', 'wh', 'wr'];
    }
    
    get endConsonants() {
        return ['d', 'k', 'l', 'm', 'n', 'r', 's', 't', 'th', 'x'];
    }
    
    // ========================================
    // KINGDOM NAMES (Long, Grand with Government Types)
    // ========================================
    
    _generateKingdomName() {
        // Generate base name
        const patterns = [
            'CVC', 'CVCV', 'CVCC', 'CVCVC', 'CVCCV',
            'CCVC', 'CCVCV', 'CCVCCV', 'VCVC', 'VCCVC',
            'CVCVN', 'CCVCVN', 'VCVCN'
        ];
        
        const pattern = this._pick(patterns);
        let baseName = '';
        
        for (let i = 0; i < pattern.length; i++) {
            const char = pattern[i];
            
            if (char === 'C') {
                if (i === 0 && this._random() < 0.3) {
                    baseName += this._pick(this.blends);
                } else {
                    baseName += this._pick(this.allConsonants);
                }
            } else if (char === 'V') {
                if (this._random() < 0.2) {
                    baseName += this._pick(this.softVowels);
                } else {
                    baseName += this._pick(this.vowels);
                }
            } else if (char === 'N') {
                const endings = ['ia', 'or', 'an', 'en', 'on', 'ar', 'ir', 'ur', 'is', 'os', 'us', 
                               'ax', 'ex', 'ix', 'um', 'heim', 'gard', 'land', 'mark', 'vale', 
                               'don', 'ria', 'nia', 'sia', 'tia', 'oth', 'eth', 'ith', 'ath',
                               'ora', 'ara', 'ura', 'wyn', 'wen', 'mir', 'dur', 'thor'];
                baseName += this._pick(endings);
            }
        }
        
        baseName = this._cleanName(baseName);
        baseName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        
        // Government types with their formats
        const governmentTypes = [
            { prefix: 'Kingdom of ', suffix: '', weight: 20 },
            { prefix: 'Empire of ', suffix: '', weight: 8 },
            { prefix: 'Republic of ', suffix: '', weight: 10 },
            { prefix: 'Duchy of ', suffix: '', weight: 12 },
            { prefix: 'Grand Duchy of ', suffix: '', weight: 6 },
            { prefix: 'Principality of ', suffix: '', weight: 8 },
            { prefix: 'Confederation of ', suffix: '', weight: 4 },
            { prefix: 'Realm of ', suffix: '', weight: 10 },
            { prefix: 'Dominion of ', suffix: '', weight: 6 },
            { prefix: 'Commonwealth of ', suffix: '', weight: 4 },
            { prefix: 'Oligarchy of ', suffix: '', weight: 3 },
            { prefix: 'Theocracy of ', suffix: '', weight: 3 },
            { prefix: 'Free City of ', suffix: '', weight: 5 },
            { prefix: 'United Provinces of ', suffix: '', weight: 3 },
            { prefix: 'Archduchy of ', suffix: '', weight: 4 },
            { prefix: 'Margraviate of ', suffix: '', weight: 3 },
            { prefix: 'Electorate of ', suffix: '', weight: 3 },
            { prefix: 'Sultanate of ', suffix: '', weight: 4 },
            { prefix: 'Caliphate of ', suffix: '', weight: 2 },
            { prefix: 'Khanate of ', suffix: '', weight: 3 },
            { prefix: 'Tsardom of ', suffix: '', weight: 3 },
            { prefix: 'Holy Empire of ', suffix: '', weight: 2 },
            { prefix: '', suffix: ' Empire', weight: 5 },
            { prefix: '', suffix: ' Republic', weight: 4 },
            { prefix: '', suffix: '', weight: 15 }, // Just the name
            { prefix: 'The ', suffix: ' Isles', weight: 3 },
            { prefix: 'The ', suffix: ' Reaches', weight: 2 },
            { prefix: 'The ', suffix: ' Marches', weight: 2 },
            { prefix: 'Lands of ', suffix: '', weight: 4 },
            { prefix: 'The Crown of ', suffix: '', weight: 3 },
        ];
        
        // Weighted random selection
        const totalWeight = governmentTypes.reduce((sum, g) => sum + g.weight, 0);
        let randomVal = this._random() * totalWeight;
        
        let selectedType = governmentTypes[0];
        for (const govType of governmentTypes) {
            randomVal -= govType.weight;
            if (randomVal <= 0) {
                selectedType = govType;
                break;
            }
        }
        
        return selectedType.prefix + baseName + selectedType.suffix;
    }
    
    // ========================================
    // COUNTY NAMES (Medium, Simple)
    // ========================================
    
    _generateCountyName() {
        const patterns = ['CVC', 'CVCV', 'VCV', 'CVVC', 'CCVC', 'VCVC'];
        const pattern = this._pick(patterns);
        
        let name = '';
        for (const char of pattern) {
            if (char === 'C') {
                name += this._pick(this.allConsonants);
            } else {
                name += this._pick(this.vowels);
            }
        }
        
        name = this._cleanName(name);
        return name.charAt(0).toUpperCase() + name.slice(1);
    }
    
    // ========================================
    // CITY NAMES (Varied)
    // ========================================
    
    _generateCityName() {
        const style = this._random();
        
        if (style < 0.4) {
            // Simple name
            return this._generateCountyName();
        } else if (style < 0.7) {
            // Name + suffix
            const base = this._generateCountyName();
            const suffixes = ['ton', 'burg', 'ville', 'ford', 'port', 'haven', 'stead', 'gate', 'bridge', 'well'];
            return base + this._pick(suffixes);
        } else {
            // Compound name
            const prefixes = ['North', 'South', 'East', 'West', 'New', 'Old', 'High', 'Low', 'Great', 'Little'];
            const base = this._generateCountyName();
            return this._pick(prefixes) + ' ' + base;
        }
    }
    
    // ========================================
    // REGION NAMES
    // ========================================
    
    _generateRegionName() {
        const style = this._random();
        
        if (style < 0.5) {
            // "The X Lands/Plains/Hills"
            const adjectives = ['Northern', 'Southern', 'Eastern', 'Western', 'Central', 'High', 'Low', 
                               'Golden', 'Silver', 'Green', 'Dark', 'Bright', 'Ancient', 'Wild', 'Frozen'];
            const terrains = ['Lands', 'Plains', 'Hills', 'Highlands', 'Lowlands', 'Steppes', 'Wastes',
                             'Reaches', 'Marches', 'Fields', 'Wilds', 'Expanse'];
            return 'The ' + this._pick(adjectives) + ' ' + this._pick(terrains);
        } else {
            // Base name + suffix
            const base = this._generateCountyName();
            const suffixes = ['lands', 'reach', 'march', 'dale', 'vale', 'shire', 'wood', 'moor', 'fen'];
            return base + this._pick(suffixes);
        }
    }
    
    // ========================================
    // RIVER NAMES
    // ========================================
    
    _generateRiverName() {
        const style = this._random();
        
        if (style < 0.4) {
            // Simple name + River
            const base = this._generateCountyName();
            return base + ' River';
        } else if (style < 0.7) {
            // Adjective River
            const adjectives = ['Crystal', 'Silver', 'Golden', 'Winding', 'Rushing', 'Silent', 'Black', 
                               'White', 'Blue', 'Green', 'Red', 'Swift', 'Lazy', 'Ancient', 'Sacred'];
            return 'The ' + this._pick(adjectives) + ' River';
        } else {
            // Name only
            return this._generateCountyName();
        }
    }
    
    // ========================================
    // MOUNTAIN NAMES
    // ========================================
    
    _generateMountainName() {
        const style = this._random();
        
        if (style < 0.3) {
            // Mount X
            const base = this._generateCountyName();
            return 'Mount ' + base;
        } else if (style < 0.6) {
            // X Peak/Summit
            const base = this._generateCountyName();
            const suffixes = ['Peak', 'Summit', 'Spire', 'Horn', 'Tooth', 'Crown'];
            return base + ' ' + this._pick(suffixes);
        } else {
            // The X Mountains
            const adjectives = ['Iron', 'Stone', 'Grey', 'White', 'Black', 'Red', 'Frozen', 'Misty',
                               'Thunder', 'Storm', 'Dragon', 'Giant', 'Ancient', 'Lonely'];
            return 'The ' + this._pick(adjectives) + ' Mountains';
        }
    }
    
    // ========================================
    // FOREST NAMES
    // ========================================
    
    _generateForestName() {
        const style = this._random();
        
        if (style < 0.4) {
            // X Forest/Wood
            const base = this._generateCountyName();
            const suffixes = ['Forest', 'Wood', 'Woods', 'Grove'];
            return base + ' ' + this._pick(suffixes);
        } else if (style < 0.7) {
            // The X Forest
            const adjectives = ['Dark', 'Deep', 'Ancient', 'Enchanted', 'Whispering', 'Silent', 'Shadowed',
                               'Golden', 'Silver', 'Emerald', 'Tangled', 'Wild', 'Sacred', 'Forbidden'];
            return 'The ' + this._pick(adjectives) + ' Forest';
        } else {
            // Xwood
            const base = this._generateCountyName();
            return base + 'wood';
        }
    }
    
    // ========================================
    // SEA/OCEAN NAMES
    // ========================================
    
    _generateSeaName() {
        const style = this._random();
        
        if (style < 0.4) {
            // X Sea
            const base = this._generateCountyName();
            return base + ' Sea';
        } else if (style < 0.7) {
            // The X Sea/Ocean
            const adjectives = ['Azure', 'Emerald', 'Golden', 'Silver', 'Endless', 'Stormy', 'Calm',
                               'Northern', 'Southern', 'Eastern', 'Western', 'Inner', 'Outer', 'Frozen'];
            const types = ['Sea', 'Ocean', 'Waters', 'Deeps'];
            return 'The ' + this._pick(adjectives) + ' ' + this._pick(types);
        } else {
            // Bay/Gulf of X
            const base = this._generateCountyName();
            const types = ['Bay', 'Gulf', 'Strait', 'Sound'];
            return this._pick(types) + ' of ' + base;
        }
    }
    
    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    /**
     * Clean up awkward letter combinations
     */
    _cleanName(name) {
        return name
            .replace(/([aeiou])\1{2,}/gi, '$1$1')     // No triple vowels
            .replace(/([^aeiou])\1{2,}/gi, '$1$1')   // No triple consonants
            .replace(/^[^a-zA-Z]/, 'K')               // Ensure starts with letter
            .replace(/(.)\1{2,}/g, '$1$1');           // No triple anything
    }
}

// Export a default instance for convenience
export const nameGenerator = new NameGenerator();
