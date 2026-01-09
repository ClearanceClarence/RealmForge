/**
 * Procedural Fantasy Name Generator
 * Generates realistic-sounding names using linguistic rules and syllable patterns
 * NO real place names - everything is procedurally generated
 */

export class NameGenerator {
    constructor(seed = Date.now()) {
        this.seed = seed;
        this.usedNames = new Set();
        this._initializeLinguisticRules();
    }
    
    /**
     * Initialize syllable patterns and linguistic rules for different cultural flavors
     */
    _initializeLinguisticRules() {
        // Simplified syllable components for more natural names
        this.cultures = {
            // Anglo/Germanic flavor
            germanic: {
                starts: ['Ald', 'Ash', 'Berg', 'Bran', 'Brynn', 'Cal', 'Cold', 'Crag', 'Dal', 'Dark', 'Deep', 'Dorn', 'Drak', 'Dun', 'East', 'Eld', 'Elm', 'Fair', 'Falk', 'Fen', 'Fern', 'Frost', 'Gold', 'Gram', 'Gran', 'Grey', 'Grim', 'Hald', 'Hart', 'Helm', 'High', 'Holm', 'Horn', 'Iron', 'Kar', 'Lang', 'Lorn', 'Mal', 'Mist', 'Moor', 'Neth', 'Nord', 'Orn', 'Rad', 'Rain', 'Raven', 'Red', 'Rim', 'Rock', 'Ros', 'Shal', 'Silver', 'Skal', 'Stark', 'Stein', 'Storm', 'Sund', 'Tal', 'Tarn', 'Thorn', 'Tor', 'Ulf', 'Val', 'Wald', 'West', 'White', 'Wild', 'Win', 'Wind', 'Wolf', 'Wulf', 'Wyrm'],
                endings: ['heim', 'wald', 'burg', 'gard', 'mark', 'holm', 'dal', 'fell', 'ford', 'sted', 'by', 'wick', 'ton', 'ham', 'land', 'berg', 'feld', 'holt', 'wood', 'moor', 'vale', 'haven', 'hold', 'firth', 'mere', 'crest', 'gate', 'hall', 'keep', 'reach', 'shore', 'watch', 'ward', 'ridge', 'cliff', 'stone', 'brook', 'bridge', 'mouth'],
                weight: 28
            },
            
            // Celtic/Gaelic flavor
            celtic: {
                starts: ['Aber', 'Ard', 'Bal', 'Ban', 'Bel', 'Ben', 'Blair', 'Bran', 'Bren', 'Caer', 'Carn', 'Conn', 'Cor', 'Cul', 'Dal', 'Derry', 'Drum', 'Dun', 'Eil', 'Fal', 'Fin', 'Glen', 'Gorm', 'Gwyn', 'Inver', 'Kel', 'Ken', 'Kil', 'Kin', 'Lach', 'Lan', 'Leth', 'Loch', 'Mal', 'Mor', 'Mull', 'Nev', 'Owen', 'Pen', 'Rath', 'Ros', 'Shan', 'Sil', 'Strath', 'Tal', 'Tir', 'Tor', 'Tull', 'Wyn'],
                endings: ['ach', 'agh', 'an', 'ane', 'ar', 'ard', 'awn', 'dor', 'dun', 'ell', 'enn', 'gan', 'glen', 'gorm', 'gwen', 'iel', 'ish', 'lin', 'loch', 'lyn', 'mor', 'more', 'ness', 'och', 'oran', 'owen', 'rath', 'reen', 'rick', 'ros', 'wen', 'wyn', 'dale', 'mere', 'vale', 'wood', 'moor'],
                weight: 20
            },
            
            // Romance/Latin flavor
            romance: {
                starts: ['Al', 'Alta', 'Aqua', 'Aran', 'Aur', 'Bel', 'Bran', 'Cal', 'Cara', 'Cas', 'Clar', 'Cor', 'Costa', 'Del', 'Dor', 'Fal', 'Fer', 'Flor', 'Font', 'Gran', 'Leon', 'Lor', 'Luc', 'Luna', 'Mar', 'Mel', 'Mir', 'Mont', 'Mor', 'Nov', 'Pal', 'Per', 'Pont', 'Port', 'Prim', 'Ros', 'Sal', 'San', 'Ser', 'Sil', 'Sol', 'Ter', 'Tor', 'Val', 'Var', 'Ver', 'Vir', 'Vit'],
                endings: ['a', 'ia', 'ana', 'ena', 'ina', 'ona', 'ara', 'era', 'ora', 'ura', 'enza', 'essa', 'etta', 'ella', 'enne', 'erre', 'esse', 'mont', 'pont', 'fort', 'val', 'mar', 'sol', 'anto', 'ento', 'esto', 'anno', 'orre', 'aine', 'onne', 'eux'],
                weight: 18
            },
            
            // Slavic flavor
            slavic: {
                starts: ['Bel', 'Bor', 'Bran', 'Cher', 'Dob', 'Dor', 'Drag', 'Gor', 'Grad', 'Grom', 'Kar', 'Kiev', 'Kras', 'Kur', 'Mal', 'Mir', 'Morav', 'Nov', 'Pol', 'Rad', 'Ros', 'Siv', 'Slav', 'Smo', 'Star', 'Stol', 'Svet', 'Tver', 'Vel', 'Vlad', 'Vol', 'Vor', 'Yar', 'Zar', 'Zel', 'Zol', 'Zor'],
                endings: ['av', 'ava', 'evo', 'ova', 'sk', 'ska', 'sko', 'ice', 'itz', 'ec', 'ak', 'ek', 'ik', 'ok', 'uk', 'in', 'yn', 'mir', 'slav', 'grad', 'gorod', 'pol', 'nov', 'dor', 'gor', 'vor', 'ansk', 'insk', 'ovka', 'evka', 'holm', 'berg'],
                weight: 14
            },
            
            // Greek/Hellenic flavor
            hellenic: {
                starts: ['Acr', 'Aeg', 'Alc', 'Andr', 'Apol', 'Arc', 'Arg', 'Ath', 'Chal', 'Chry', 'Del', 'Dion', 'Dor', 'Eph', 'Hel', 'Her', 'Kal', 'Kor', 'Leon', 'Lyc', 'Mac', 'Meg', 'Myr', 'Nik', 'Olym', 'Pal', 'Pel', 'Per', 'Phil', 'Pol', 'Pyth', 'Rho', 'Sal', 'Spar', 'Stag', 'Theb', 'Ther', 'Thes', 'Tyr', 'Xan', 'Zak'],
                endings: ['os', 'us', 'is', 'as', 'es', 'on', 'ion', 'eon', 'a', 'ia', 'ea', 'eia', 'aia', 'polis', 'dros', 'thos', 'kos', 'nos', 'ros', 'sos', 'tos', 'ene', 'one', 'ane', 'ine', 'ora', 'ara', 'era', 'andria', 'onia', 'opia'],
                weight: 12
            },
            
            // Eastern/Arabic flavor
            eastern: {
                starts: ['Al', 'Ash', 'Bah', 'Dar', 'Fah', 'Gha', 'Haz', 'Isf', 'Jaz', 'Kha', 'Mah', 'Mar', 'Mir', 'Nah', 'Qar', 'Rah', 'Sah', 'Sal', 'Sam', 'Sar', 'Sha', 'Sul', 'Tab', 'Tar', 'Zah', 'Zam', 'Zar'],
                endings: ['an', 'ar', 'ad', 'ah', 'am', 'as', 'at', 'az', 'en', 'er', 'id', 'in', 'ir', 'is', 'un', 'ur', 'abad', 'istan', 'khan', 'pur', 'zar', 'dar', 'nar', 'mar', 'var', 'and', 'esh', 'aq', 'iq'],
                weight: 8
            }
        };
        
        // Government types - all "X of" format
        this.governmentTypes = [
            { prefix: 'Kingdom of ', weight: 30 },
            { prefix: 'Duchy of ', weight: 18 },
            { prefix: 'Republic of ', weight: 10 },
            { prefix: 'Grand Duchy of ', weight: 8 },
            { prefix: 'Principality of ', weight: 8 },
            { prefix: 'Empire of ', weight: 6 },
            { prefix: 'Realm of ', weight: 12 },
            { prefix: 'Dominion of ', weight: 5 },
            { prefix: 'Crown of ', weight: 5 },
            { prefix: 'Archduchy of ', weight: 4 },
            { prefix: 'County of ', weight: 6 },
            { prefix: 'Barony of ', weight: 4 },
            { prefix: 'March of ', weight: 4 },
            { prefix: 'Free City of ', weight: 3 },
            { prefix: 'Commonwealth of ', weight: 3 },
            { prefix: 'Confederation of ', weight: 3 },
            { prefix: 'Sultanate of ', weight: 3 },
            { prefix: 'Khanate of ', weight: 3 },
            { prefix: 'Province of ', weight: 4 },
            { prefix: 'Throne of ', weight: 2 },
            { prefix: 'House of ', weight: 3 }
        ];
        
        this.totalGovWeight = this.governmentTypes.reduce((sum, g) => sum + g.weight, 0);
        this.totalCultureWeight = Object.values(this.cultures).reduce((sum, c) => sum + c.weight, 0);
    }
    
    /**
     * Reset used names
     */
    reset() {
        this.usedNames.clear();
    }
    
    /**
     * Seeded random number generator
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
     * Pick weighted random culture
     */
    _pickCulture() {
        let random = this._random() * this.totalCultureWeight;
        for (const [name, culture] of Object.entries(this.cultures)) {
            random -= culture.weight;
            if (random <= 0) return culture;
        }
        return this.cultures.germanic;
    }
    
    /**
     * Pick weighted random government type
     */
    _pickGovernment() {
        let random = this._random() * this.totalGovWeight;
        for (const gov of this.governmentTypes) {
            random -= gov.weight;
            if (random <= 0) return gov;
        }
        return this.governmentTypes[0];
    }
    
    /**
     * Generate a single syllable
     */
    _generateSyllable(culture, position = 'middle') {
        // Not used in new approach
        return '';
    }
    
    /**
     * Generate a base place name using start + ending
     */
    _generateBaseName() {
        const culture = this._pickCulture();
        
        // Pick a start and ending
        const start = this._pick(culture.starts);
        const ending = this._pick(culture.endings);
        
        // Combine intelligently
        let name = start;
        
        // Avoid double consonants at junction
        const startEnd = start.slice(-1).toLowerCase();
        const endStart = ending[0].toLowerCase();
        
        if (startEnd === endStart && !/[aeiou]/i.test(startEnd)) {
            name = start.slice(0, -1);
        }
        
        // Avoid awkward vowel combinations
        const startEndsVowel = /[aeiou]$/i.test(name);
        const endStartsVowel = /^[aeiou]/i.test(ending);
        
        if (startEndsVowel && endStartsVowel) {
            // Skip first vowel of ending
            name += ending.slice(1);
        } else {
            name += ending;
        }
        
        // Clean up the name
        name = this._cleanName(name);
        
        // Ensure first letter is uppercase
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
    
    /**
     * Clean up awkward letter combinations
     */
    _cleanName(name) {
        return name
            // Remove triple letters
            .replace(/(.)\1\1+/g, '$1$1')
            // Fix double vowels that sound awkward
            .replace(/([aeiou])\1/gi, '$1')
            // Ensure it's not too short
            .replace(/^(.{1,3})$/, '$1an');
    }
    
    /**
     * Check if name is valid
     */
    _isValidName(name) {
        if (name.length < 4 || name.length > 16) return false;
        if (!/[aeiou]/i.test(name)) return false;
        return true;
    }
    
    /**
     * Generate multiple unique names
     */
    generateNames(count, type = 'kingdom') {
        const names = [];
        
        for (let i = 0; i < count; i++) {
            let name;
            let attempts = 0;
            
            do {
                name = this._generateName(type);
                attempts++;
            } while ((this.usedNames.has(name.toLowerCase()) || !this._isValidName(name.replace(/^.+of /, ''))) && attempts < 100);
            
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
            case 'kingdom': return this._generateKingdomName();
            case 'county': return this._generateBaseName();
            case 'city': return this._generateCityName();
            case 'region': return this._generateRegionName();
            case 'river': return this._generateRiverName();
            case 'mountain': return this._generateMountainName();
            case 'forest': return this._generateForestName();
            case 'sea': return this._generateSeaName();
            default: return this._generateKingdomName();
        }
    }
    
    /**
     * Generate kingdom name with government type
     */
    _generateKingdomName() {
        const baseName = this._generateBaseName();
        const gov = this._pickGovernment();
        return gov.prefix + baseName;
    }
    
    /**
     * Generate city name
     */
    _generateCityName() {
        const style = this._random();
        
        if (style < 0.7) {
            return this._generateBaseName();
        } else {
            const prefixes = ['Port ', 'Fort ', 'New ', 'Old ', 'High ', 'Low '];
            return this._pick(prefixes) + this._generateBaseName();
        }
    }
    
    /**
     * Generate region name
     */
    _generateRegionName() {
        const style = this._random();
        
        if (style < 0.4) {
            const adjectives = ['Northern', 'Southern', 'Eastern', 'Western', 'Central', 'High',
                               'Low', 'Golden', 'Silver', 'Emerald', 'Verdant', 'Iron', 'Crimson'];
            const terrains = ['Lands', 'Plains', 'Hills', 'Highlands', 'Lowlands', 'Reaches',
                             'Marches', 'Steppes', 'Valleys', 'Wilds', 'Shores'];
            return 'The ' + this._pick(adjectives) + ' ' + this._pick(terrains);
        } else {
            return this._generateBaseName();
        }
    }
    
    /**
     * Generate river name - shorter, elegant style for maps
     */
    _generateRiverName() {
        const style = this._random();
        const culture = this._pickCulture();
        const baseName = this._pick(culture.starts);
        
        if (style < 0.6) {
            // Simple: "Name R." or "R. Name"
            return baseName + ' R.';
        } else if (style < 0.85) {
            // With suffix: "Namebrook", "Namewater"
            const suffixes = ['brook', 'water', 'burn', 'beck', 'run'];
            return baseName + this._pick(suffixes);
        } else {
            // Adjective style: "Blue R.", "Swift R."
            const adjectives = ['Blue', 'White', 'Black', 'Red', 'Swift', 'Long', 'Clear'];
            return this._pick(adjectives) + ' R.';
        }
    }
    
    /**
     * Generate mountain name
     */
    _generateMountainName() {
        const style = this._random();
        
        if (style < 0.35) {
            return 'Mount ' + this._generateBaseName();
        } else if (style < 0.6) {
            const summits = ['Peak', 'Summit', 'Spire', 'Horn', 'Crown', 'Crest'];
            return this._generateBaseName() + ' ' + this._pick(summits);
        } else {
            const adjectives = ['Iron', 'Stone', 'Grey', 'White', 'Black', 'Red', 'Frost',
                               'Storm', 'Thunder', 'Dragon', 'Misty', 'Shadow', 'Lonely'];
            return 'The ' + this._pick(adjectives) + ' Mountains';
        }
    }
    
    /**
     * Generate forest name
     */
    _generateForestName() {
        const style = this._random();
        
        if (style < 0.5) {
            const types = ['Forest', 'Wood', 'Woods', 'Grove', 'Weald'];
            return this._generateBaseName() + ' ' + this._pick(types);
        } else {
            const adjectives = ['Dark', 'Deep', 'Ancient', 'Enchanted', 'Whispering', 'Silent',
                               'Shadow', 'Golden', 'Emerald', 'Wild', 'Sacred', 'Forbidden'];
            return 'The ' + this._pick(adjectives) + ' Forest';
        }
    }
    
    /**
     * Generate sea name
     */
    _generateSeaName() {
        const style = this._random();
        
        if (style < 0.4) {
            return this._generateBaseName() + ' Sea';
        } else if (style < 0.7) {
            const adjectives = ['Azure', 'Emerald', 'Golden', 'Silver', 'Endless', 'Stormy',
                               'Northern', 'Southern', 'Inner', 'Outer', 'Frozen', 'Sunlit'];
            const types = ['Sea', 'Ocean', 'Waters'];
            return 'The ' + this._pick(adjectives) + ' ' + this._pick(types);
        } else {
            const bodies = ['Bay', 'Gulf', 'Strait', 'Sound', 'Channel'];
            return this._pick(bodies) + ' of ' + this._generateBaseName();
        }
    }
}

// Export a default instance
export const nameGenerator = new NameGenerator();
