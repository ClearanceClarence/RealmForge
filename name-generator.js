/**
 * Advanced Procedural Fantasy Name Generator
 * 
 * Features:
 * - Multiple generation strategies (Markov chains, syllable-based, compound, affixed)
 * - Extensive cultural phonologies with proper linguistic rules
 * - Consonant cluster and vowel harmony rules
 * - Regional consistency for cohesive naming
 * - 20+ name types (places, people, features, organizations, items)
 * - Cultural blending for border regions
 * - Etymological tracking
 * 
 * @author RealmForge
 * @version 2.0.0
 */

export class NameGenerator {
    constructor(seed = Date.now()) {
        this.seed = seed;
        this.initialSeed = seed;
        this.usedNames = new Set();
        this.nameCache = new Map();
        this.markovCache = new Map();
        
        this._initializePhonology();
        this._initializeCultures();
        this._initializeNameComponents();
        this._buildMarkovModels();
    }
    
    /**
     * Reset the generator state for fresh name generation
     * Clears used names but keeps configuration
     */
    reset(newSeed) {
        if (newSeed !== undefined) {
            this.seed = newSeed;
        }
        this.usedNames.clear();
        this.nameCache.clear();
    }
    
    /**
     * Clear only city names from used set (for regeneration)
     */
    clearCityNames(cityNames) {
        if (cityNames) {
            for (const name of cityNames) {
                if (name) {
                    this.usedNames.delete(name.toLowerCase());
                }
            }
        }
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    /**
     * Initialize universal phonological rules
     */
    _initializePhonology() {
        // Valid consonant clusters by position
        this.clusters = {
            onset: [
                'bl', 'br', 'ch', 'cl', 'cr', 'dr', 'dw', 'fl', 'fr', 'gl', 'gr', 
                'gw', 'kl', 'kr', 'kw', 'pl', 'pr', 'qu', 'sc', 'sh', 'sk', 'sl', 
                'sm', 'sn', 'sp', 'st', 'str', 'sw', 'th', 'tr', 'tw', 'wh', 'wr',
                'spr', 'scr', 'spl', 'thr', 'shr'
            ],
            coda: [
                'ck', 'ct', 'ft', 'ld', 'lf', 'lk', 'lm', 'ln', 'lp', 'ls', 'lt',
                'mp', 'nd', 'ng', 'nk', 'nt', 'pt', 'rb', 'rc', 'rd', 'rf', 'rg',
                'rk', 'rl', 'rm', 'rn', 'rp', 'rs', 'rt', 'rv', 'rz', 'sk', 'sp',
                'ss', 'st', 'th', 'ts', 'xt', 'nch', 'nth', 'rth', 'rst'
            ]
        };

        // Forbidden sequences (unpronounceable or ugly)
        this.forbidden = [
            /[bcdfghjklmnpqrstvwxz]{4,}/i,  // 4+ consonants
            /[aeiou]{3,}/i,                   // 3+ vowels
            /(.)\1\1/i,                       // Triple letters
            /[qx][aeiou]?[qx]/i,             // Double harsh consonants
            /[pb][pb]/i,                      // Double bilabials
            /[td][td]/i,                      // Double dentals
            /[kg][kg]/i,                      // Double velars
            /^[^aeiou]{4,}/i,                // Start with 4+ consonants
            /[^aeiou]{4,}$/i,                // End with 4+ consonants
            /wu|uu|ii|yi|iy/i,               // Awkward vowel combos
        ];

        // Vowel harmony groups
        this.vowelGroups = {
            front: ['e', 'i', 'ä', 'ö', 'ü'],
            back: ['a', 'o', 'u'],
            neutral: ['e', 'i']
        };
    }

    /**
     * Initialize cultural phonologies and naming conventions
     */
    _initializeCultures() {
        this.cultures = {
            // Germanic/Anglo-Saxon - sturdy, compound names
            germanic: {
                weight: 25,
                phonemes: {
                    onsets: ['', 'b', 'br', 'd', 'dr', 'f', 'fr', 'g', 'gr', 'h', 'k', 'kr', 'l', 'm', 'n', 'r', 's', 'st', 'str', 't', 'th', 'tr', 'v', 'w'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'ae', 'ei', 'au', 'ou'],
                    codas: ['', 'b', 'd', 'f', 'g', 'k', 'l', 'ld', 'lf', 'lk', 'm', 'n', 'nd', 'ng', 'nk', 'r', 'rd', 'rg', 'rk', 'rm', 'rn', 'rt', 's', 'st', 't', 'th', 'x']
                },
                roots: ['ald', 'ash', 'berg', 'bran', 'bryn', 'burg', 'dal', 'dor', 'drak', 'eld', 'falk', 'fen', 'frost', 'gard', 'gram', 'grim', 'hald', 'hart', 'heim', 'helm', 'holt', 'horn', 'iron', 'kar', 'lang', 'lorn', 'mark', 'neth', 'nord', 'orn', 'rad', 'raven', 'rim', 'shal', 'skal', 'stark', 'stein', 'storm', 'sund', 'tal', 'tarn', 'thorn', 'tor', 'ulf', 'wald', 'wulf', 'wyrm'],
                prefixes: ['Ald', 'All', 'Ash', 'Berg', 'Black', 'Bran', 'Bright', 'Cold', 'Dark', 'Deep', 'Dun', 'East', 'Eld', 'Ever', 'Fair', 'Far', 'Fell', 'Frost', 'Gold', 'Grand', 'Grey', 'Grim', 'Hale', 'Hard', 'High', 'Holt', 'Horn', 'Iron', 'Long', 'Low', 'Mid', 'Mist', 'Moon', 'Nether', 'New', 'North', 'Old', 'Rain', 'Red', 'Rock', 'Sea', 'Shadow', 'Silver', 'Stark', 'Star', 'Steel', 'Stone', 'Storm', 'Strong', 'Sun', 'Swift', 'Thorn', 'Thunder', 'True', 'West', 'White', 'Wild', 'Wind', 'Winter', 'Wolf', 'Wood'],
                suffixes: ['ard', 'ax', 'bane', 'berg', 'born', 'brand', 'burg', 'by', 'dale', 'dor', 'fall', 'fell', 'feld', 'firth', 'ford', 'gard', 'garth', 'gate', 'grave', 'hall', 'ham', 'haven', 'heim', 'helm', 'hold', 'holm', 'holt', 'keep', 'land', 'leigh', 'mark', 'mead', 'mere', 'mond', 'moor', 'mund', 'ness', 'port', 'reach', 'ridge', 'rock', 'shire', 'shore', 'side', 'stead', 'sted', 'stone', 'thorp', 'ton', 'vale', 'wall', 'ward', 'watch', 'water', 'way', 'wick', 'wood', 'worth', 'wrath', 'wyn'],
                titles: ['Kingdom', 'Realm', 'Duchy', 'March', 'Hold', 'Dominion', 'Throne'],
                nameStyle: 'compound'
            },

            // Norse/Viking - harsh, runic feel
            norse: {
                weight: 18,
                phonemes: {
                    onsets: ['', 'b', 'br', 'd', 'dr', 'f', 'fr', 'g', 'gn', 'gr', 'h', 'hj', 'hl', 'hr', 'hv', 'j', 'k', 'kj', 'kn', 'kr', 'kv', 'l', 'm', 'n', 'r', 's', 'sj', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sv', 't', 'th', 'tr', 'tv', 'v'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'y', 'æ', 'ø', 'å', 'ei', 'au', 'ey', 'øy'],
                    codas: ['', 'd', 'f', 'g', 'k', 'l', 'ld', 'lf', 'lg', 'lk', 'll', 'lm', 'ln', 'lp', 'ls', 'lt', 'lv', 'm', 'n', 'nd', 'ng', 'nk', 'nn', 'r', 'rd', 'rf', 'rg', 'rk', 'rl', 'rm', 'rn', 'rp', 'rs', 'rt', 'rv', 's', 'sk', 'st', 't', 'th', 'v', 'x']
                },
                roots: ['arn', 'asg', 'ask', 'bald', 'bjorn', 'brag', 'frey', 'gar', 'gjal', 'grim', 'gunn', 'haf', 'heid', 'hel', 'hild', 'hlad', 'hrafn', 'ing', 'jot', 'kald', 'mjol', 'nid', 'nif', 'odin', 'rag', 'ran', 'sig', 'skald', 'skar', 'surt', 'sval', 'thor', 'thrud', 'tyr', 'ulf', 'und', 'val', 'van', 'vid', 'vig', 'ygg', 'yr'],
                prefixes: ['Arn', 'Asg', 'Bjorn', 'Brag', 'Eid', 'Ey', 'Fjar', 'Frost', 'Gald', 'Gjal', 'Grim', 'Guld', 'Gunn', 'Haf', 'Heid', 'Hel', 'Hrafn', 'Hrim', 'Is', 'Jarn', 'Jot', 'Kald', 'Kval', 'Mid', 'Mjol', 'Mork', 'Nid', 'Nif', 'Nord', 'Rag', 'Sig', 'Skald', 'Skar', 'Skjold', 'Sno', 'Storm', 'Sval', 'Svar', 'Thor', 'Ulf', 'Val', 'Van', 'Vin', 'Yr'],
                suffixes: ['ard', 'borg', 'by', 'dal', 'fell', 'fjall', 'fjord', 'foss', 'gard', 'grund', 'hall', 'haug', 'heim', 'hild', 'hof', 'holm', 'hus', 'kar', 'lund', 'mark', 'mund', 'nes', 'rid', 'rik', 'stad', 'stein', 'strom', 'thorp', 'tun', 'und', 'vag', 'vald', 'vang', 'var', 'vik', 'voll', 'vor'],
                titles: ['Jarldom', 'Konungriki', 'Hold', 'Clan', 'Hird'],
                nameStyle: 'compound'
            },

            // Celtic/Gaelic - lyrical, flowing
            celtic: {
                weight: 20,
                phonemes: {
                    onsets: ['', 'b', 'bh', 'br', 'c', 'ch', 'cl', 'cn', 'cr', 'd', 'dh', 'dr', 'f', 'fh', 'fl', 'fr', 'g', 'gh', 'gl', 'gn', 'gr', 'gw', 'l', 'll', 'm', 'mh', 'n', 'p', 'ph', 'r', 'rh', 's', 'sc', 'sg', 'sh', 'sl', 'sm', 'sn', 'sp', 'st', 'str', 't', 'th', 'tr', 'w'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'ao', 'ea', 'ei', 'eo', 'ia', 'io', 'oi', 'ua', 'ui'],
                    codas: ['', 'b', 'c', 'ch', 'd', 'dh', 'f', 'g', 'gh', 'l', 'll', 'm', 'n', 'nd', 'ng', 'nn', 'r', 'rn', 's', 'ss', 't', 'th']
                },
                roots: ['aber', 'ard', 'bal', 'ban', 'bel', 'ben', 'bran', 'bren', 'caer', 'carn', 'conn', 'cul', 'dail', 'dan', 'drum', 'dun', 'eil', 'fal', 'fin', 'gael', 'glen', 'gorm', 'gwyn', 'kel', 'kil', 'lach', 'lin', 'loch', 'lon', 'mal', 'mor', 'mull', 'nev', 'owen', 'rath', 'ros', 'shan', 'sil', 'strath', 'tal', 'tir', 'tull', 'wyn'],
                prefixes: ['Aber', 'Ard', 'Bal', 'Ban', 'Bel', 'Ben', 'Blair', 'Bran', 'Bren', 'Caer', 'Carn', 'Ceann', 'Cill', 'Cnoc', 'Conn', 'Cor', 'Craig', 'Cul', 'Dal', 'Derry', 'Drum', 'Dun', 'Eil', 'Fal', 'Fin', 'Glen', 'Gorm', 'Gwyn', 'Inver', 'Kel', 'Ken', 'Kil', 'Kin', 'Knock', 'Lach', 'Lan', 'Leth', 'Lis', 'Loch', 'Lon', 'Mal', 'Mor', 'Mull', 'Nev', 'Owen', 'Pen', 'Rath', 'Ros', 'Shan', 'Sil', 'Strath', 'Tal', 'Tir', 'Tor', 'Tull', 'Ty', 'Wyn'],
                suffixes: ['ach', 'agh', 'aine', 'an', 'ane', 'ar', 'ard', 'awn', 'dale', 'dhu', 'dor', 'dun', 'ell', 'enn', 'gan', 'glas', 'glen', 'gorm', 'gwen', 'ian', 'ich', 'iel', 'in', 'ine', 'ish', 'lin', 'linn', 'loch', 'lyn', 'mere', 'mor', 'more', 'moor', 'ness', 'och', 'oran', 'owen', 'pool', 'rath', 'reen', 'rick', 'ros', 'vale', 'wen', 'wick', 'wyn', 'wood'],
                titles: ['Kingdom', 'Tuath', 'Ri', 'Clan', 'Province'],
                nameStyle: 'flowing'
            },

            // Romance/Latin - elegant, melodic
            romance: {
                weight: 18,
                phonemes: {
                    onsets: ['', 'b', 'bl', 'br', 'c', 'ch', 'cl', 'cr', 'd', 'dr', 'f', 'fl', 'fr', 'g', 'gh', 'gl', 'gn', 'gr', 'l', 'm', 'n', 'p', 'pl', 'pr', 'qu', 'r', 's', 'sc', 'sp', 'st', 'str', 't', 'tr', 'v'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'au', 'ei', 'eu', 'ia', 'ie', 'io', 'iu', 'oa', 'oe', 'oi', 'ou', 'ua', 'ue', 'ui', 'uo'],
                    codas: ['', 'c', 'd', 'l', 'll', 'm', 'n', 'nd', 'nn', 'nt', 'r', 'rd', 'rn', 'rs', 'rt', 's', 'ss', 't', 'x', 'z']
                },
                roots: ['alta', 'aqua', 'aran', 'aur', 'bell', 'bran', 'clar', 'cor', 'cost', 'del', 'dor', 'fal', 'fer', 'flor', 'font', 'gran', 'leon', 'lor', 'luc', 'lun', 'mar', 'mel', 'mir', 'mont', 'mor', 'nov', 'pal', 'per', 'pont', 'port', 'prim', 'ros', 'sal', 'san', 'ser', 'sil', 'sol', 'ter', 'tor', 'val', 'var', 'ver', 'vir', 'vit'],
                prefixes: ['Al', 'Alta', 'Aqua', 'Aran', 'Aur', 'Bel', 'Bell', 'Bran', 'Cal', 'Cara', 'Cas', 'Clar', 'Cor', 'Costa', 'Del', 'Dor', 'Fal', 'Fer', 'Fior', 'Flor', 'Font', 'Gran', 'Leon', 'Lor', 'Luc', 'Luna', 'Mar', 'Mel', 'Mir', 'Mont', 'Mor', 'Nov', 'Pal', 'Per', 'Pont', 'Port', 'Prim', 'Ros', 'Sal', 'San', 'Ser', 'Sil', 'Sol', 'Stella', 'Ter', 'Tor', 'Val', 'Var', 'Ver', 'Vir', 'Vit'],
                suffixes: ['a', 'aine', 'ana', 'anno', 'anto', 'ara', 'azza', 'ella', 'ello', 'ena', 'enne', 'ento', 'enza', 'era', 'erre', 'essa', 'este', 'esto', 'etta', 'etto', 'eux', 'fort', 'ia', 'ica', 'ina', 'ino', 'io', 'ise', 'issa', 'ista', 'ita', 'ium', 'mar', 'mont', 'ola', 'olo', 'ona', 'one', 'onne', 'ora', 'orre', 'osa', 'oso', 'pont', 'sol', 'ura', 'val', 'zia'],
                titles: ['Kingdom', 'Republic', 'Principality', 'Duchy', 'Province', 'Empire'],
                nameStyle: 'melodic'
            },

            // Slavic - rich consonants, distinctive
            slavic: {
                weight: 14,
                phonemes: {
                    onsets: ['', 'b', 'bl', 'br', 'c', 'ch', 'd', 'dr', 'dv', 'dz', 'g', 'gl', 'gn', 'gr', 'k', 'kl', 'kr', 'kv', 'l', 'm', 'ml', 'n', 'p', 'pl', 'pr', 'r', 's', 'sh', 'sk', 'sl', 'sm', 'sn', 'sp', 'sr', 'st', 'str', 'sv', 't', 'tr', 'ts', 'tv', 'v', 'vl', 'vr', 'z', 'zh', 'zl', 'zn', 'zr', 'zv'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'y', 'ai', 'ei', 'oi', 'ou'],
                    codas: ['', 'b', 'c', 'ch', 'd', 'g', 'k', 'l', 'lk', 'm', 'n', 'nd', 'nk', 'ns', 'nt', 'nz', 'p', 'r', 'rk', 's', 'sh', 'sk', 'st', 't', 'ts', 'v', 'z', 'zh', 'zn']
                },
                roots: ['bel', 'bor', 'bran', 'cher', 'dob', 'drag', 'gor', 'grad', 'grom', 'kar', 'kras', 'kur', 'mal', 'mir', 'morav', 'nov', 'pol', 'rad', 'ros', 'siv', 'slav', 'smo', 'star', 'stol', 'svet', 'tver', 'vel', 'vlad', 'vol', 'vor', 'yar', 'zar', 'zel', 'zol', 'zor'],
                prefixes: ['Bel', 'Bez', 'Blag', 'Bol', 'Bor', 'Bran', 'Cher', 'Dob', 'Dol', 'Dor', 'Drag', 'Gor', 'Grad', 'Grom', 'Jar', 'Kar', 'Kras', 'Kur', 'Mal', 'Mir', 'Morav', 'Nov', 'Pol', 'Prav', 'Rad', 'Ros', 'Siv', 'Slav', 'Smo', 'Star', 'Stol', 'Straz', 'Svet', 'Tver', 'Vel', 'Ver', 'Vlad', 'Vol', 'Vor', 'Vos', 'Vysh', 'Yar', 'Zar', 'Zel', 'Zol', 'Zor'],
                suffixes: ['ac', 'ak', 'ansk', 'av', 'ava', 'berg', 'dor', 'ec', 'ek', 'ev', 'evka', 'evo', 'gor', 'gorod', 'grad', 'holm', 'ice', 'ik', 'in', 'insk', 'itz', 'mir', 'nov', 'ok', 'ov', 'ova', 'ovka', 'pol', 'sk', 'ska', 'sko', 'slav', 'uk', 'vor', 'yn'],
                titles: ['Tsardom', 'Knyazdom', 'Voivodeship', 'Oblast', 'Krai'],
                nameStyle: 'consonantal'
            },

            // Hellenic/Greek - classical, philosophical
            hellenic: {
                weight: 12,
                phonemes: {
                    onsets: ['', 'b', 'ch', 'd', 'g', 'gn', 'h', 'k', 'kh', 'kr', 'l', 'm', 'mn', 'n', 'p', 'ph', 'pl', 'pn', 'pr', 'ps', 'pt', 'r', 'rh', 's', 'sk', 'sp', 'st', 'str', 't', 'th', 'tr', 'x', 'z'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'y', 'ae', 'ai', 'ao', 'au', 'ea', 'ei', 'eo', 'eu', 'ia', 'io', 'oe', 'oi', 'ou'],
                    codas: ['', 'b', 'd', 'k', 'ks', 'l', 'm', 'n', 'nd', 'ng', 'nk', 'nt', 'nth', 'nx', 'p', 'ph', 'ps', 'r', 'rk', 's', 't', 'th', 'x']
                },
                roots: ['acro', 'aeg', 'agr', 'alc', 'alex', 'andr', 'arch', 'arg', 'athen', 'chal', 'chry', 'del', 'dion', 'dor', 'eph', 'hel', 'her', 'kall', 'kor', 'leon', 'lyc', 'mac', 'meg', 'myr', 'nik', 'olym', 'pal', 'pel', 'per', 'phil', 'pol', 'pyth', 'rho', 'sal', 'spart', 'stag', 'theb', 'ther', 'thes', 'tyr', 'xan', 'zak'],
                prefixes: ['Acro', 'Aeg', 'Agath', 'Alc', 'Alex', 'Andr', 'Ant', 'Apol', 'Arc', 'Arg', 'Ath', 'Chal', 'Chry', 'Del', 'Dem', 'Dion', 'Dor', 'Eph', 'Hel', 'Her', 'Hip', 'Kal', 'Kar', 'Kor', 'Leon', 'Lyc', 'Mac', 'Meg', 'Myr', 'Nek', 'Nik', 'Olym', 'Pal', 'Pel', 'Per', 'Phil', 'Plat', 'Pol', 'Pyth', 'Rho', 'Sal', 'Soph', 'Spar', 'Stag', 'Theb', 'Ther', 'Thes', 'Tyr', 'Xan', 'Zak', 'Zen'],
                suffixes: ['a', 'aia', 'an', 'ane', 'andria', 'andros', 'ara', 'as', 'dros', 'ea', 'eia', 'ene', 'eon', 'era', 'es', 'ia', 'ias', 'ikos', 'ine', 'ion', 'ios', 'is', 'kos', 'nos', 'on', 'one', 'onia', 'opia', 'ora', 'os', 'polis', 'ros', 'sos', 'thos', 'tos', 'um', 'us'],
                titles: ['Empire', 'League', 'Hegemony', 'Archonate', 'Tyranny', 'Basileia'],
                nameStyle: 'classical'
            },

            // Arabic/Eastern - ornate, flowing
            arabic: {
                weight: 10,
                phonemes: {
                    onsets: ['', 'b', 'd', 'dh', 'f', 'gh', 'h', 'j', 'k', 'kh', 'l', 'm', 'n', 'q', 'r', 's', 'sh', 't', 'th', 'w', 'y', 'z'],
                    nuclei: ['a', 'i', 'u', 'aa', 'ii', 'uu', 'ai', 'au'],
                    codas: ['', 'b', 'd', 'f', 'h', 'j', 'k', 'l', 'm', 'n', 'r', 's', 'sh', 't', 'z']
                },
                roots: ['al', 'ash', 'bah', 'dar', 'fah', 'gha', 'haz', 'isf', 'jaz', 'kha', 'mah', 'mar', 'mir', 'nah', 'qar', 'rah', 'sah', 'sal', 'sam', 'sar', 'sha', 'sul', 'tab', 'tar', 'zah', 'zam', 'zar'],
                prefixes: ['Al', 'Ash', 'Bab', 'Bah', 'Dar', 'Fah', 'Gha', 'Haz', 'Ibn', 'Isf', 'Jab', 'Jaz', 'Kaf', 'Kha', 'Mah', 'Mar', 'Mir', 'Nah', 'Nur', 'Qaf', 'Qar', 'Rah', 'Saf', 'Sah', 'Sal', 'Sam', 'Sar', 'Sha', 'Sul', 'Tab', 'Taj', 'Tar', 'Zaf', 'Zah', 'Zam', 'Zar'],
                suffixes: ['a', 'abad', 'ad', 'ah', 'am', 'an', 'and', 'ar', 'as', 'at', 'az', 'dar', 'en', 'er', 'esh', 'id', 'in', 'iq', 'ir', 'is', 'istan', 'khan', 'mar', 'nar', 'pur', 'un', 'ur', 'var', 'zar'],
                titles: ['Sultanate', 'Emirate', 'Caliphate', 'Khanate', 'Satrapy'],
                nameStyle: 'ornate'
            },

            // Japanese/East Asian - syllabic, nature-focused
            eastasian: {
                weight: 10,
                phonemes: {
                    onsets: ['', 'b', 'ch', 'd', 'f', 'g', 'h', 'j', 'k', 'ky', 'm', 'my', 'n', 'ny', 'p', 'py', 'r', 'ry', 's', 'sh', 't', 'ts', 'w', 'y', 'z'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'ai', 'ao', 'ei', 'ou', 'uu'],
                    codas: ['', 'n', 'ng']
                },
                roots: ['aki', 'ama', 'ao', 'ara', 'asa', 'chi', 'dai', 'fuku', 'fuji', 'hana', 'haru', 'haya', 'hika', 'hiro', 'ishi', 'kage', 'kai', 'kama', 'kawa', 'kaze', 'kiku', 'kiri', 'kita', 'kumo', 'kuro', 'masa', 'mina', 'miya', 'mizu', 'mori', 'naga', 'naka', 'nami', 'niwa', 'rei', 'riku', 'ryu', 'saku', 'shima', 'shiro', 'sora', 'taka', 'taki', 'tama', 'tani', 'tora', 'tsuki', 'umi', 'yama', 'yuki', 'yume'],
                prefixes: ['Aka', 'Aki', 'Ama', 'Ao', 'Ara', 'Asa', 'Chi', 'Dai', 'Fuku', 'Fuji', 'Hana', 'Haru', 'Haya', 'Hika', 'Hiro', 'Ishi', 'Kage', 'Kai', 'Kama', 'Kawa', 'Kaze', 'Kiku', 'Kiri', 'Kita', 'Kumo', 'Kuro', 'Masa', 'Mina', 'Miya', 'Mizu', 'Mori', 'Naga', 'Naka', 'Nami', 'Niwa', 'Rei', 'Riku', 'Ryu', 'Saku', 'Shima', 'Shin', 'Shiro', 'Sora', 'Taka', 'Taki', 'Tama', 'Tani', 'Tora', 'Tsuki', 'Umi', 'Yama', 'Yasu', 'Yuki', 'Yume'],
                suffixes: ['an', 'chi', 'da', 'en', 'fu', 'ga', 'gawa', 'hara', 'ji', 'ka', 'kawa', 'ko', 'kuni', 'kura', 'ma', 'mae', 'mori', 'moto', 'mura', 'nami', 'no', 'oka', 'ra', 'ri', 'saki', 'shima', 'shiro', 'ta', 'tani', 'to', 'ya', 'yama', 'zaki', 'zan'],
                titles: ['Shogunate', 'Empire', 'Province', 'Domain', 'Clan'],
                nameStyle: 'syllabic'
            },

            // Aztec/Mesoamerican - complex consonants, distinctive
            mesoamerican: {
                weight: 6,
                phonemes: {
                    onsets: ['', 'c', 'ch', 'cu', 'hu', 'ix', 'm', 'n', 'p', 'qu', 't', 'tl', 'tz', 'x', 'z'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'ua', 'ue', 'ui'],
                    codas: ['', 'c', 'l', 'n', 'tl', 'tz', 'x', 'z']
                },
                roots: ['atl', 'chal', 'chi', 'coat', 'cuauh', 'huitz', 'itz', 'ix', 'maz', 'mex', 'mict', 'nex', 'oce', 'ollin', 'pop', 'quetz', 'tecu', 'ten', 'teot', 'tepe', 'tex', 'tez', 'tlal', 'toch', 'ton', 'xal', 'xil', 'xoch', 'yao', 'zac'],
                prefixes: ['Acatl', 'Atl', 'Chal', 'Chi', 'Coat', 'Cuauh', 'Huitz', 'Itz', 'Ix', 'Maz', 'Mex', 'Mict', 'Nex', 'Oce', 'Ollin', 'Pop', 'Quetz', 'Tecu', 'Ten', 'Teot', 'Tepe', 'Tex', 'Tez', 'Tlal', 'Tlax', 'Toch', 'Ton', 'Xal', 'Xil', 'Xoch', 'Yao', 'Zac'],
                suffixes: ['al', 'an', 'atl', 'cal', 'can', 'catl', 'co', 'huac', 'hua', 'ic', 'il', 'in', 'itz', 'ix', 'lan', 'man', 'mec', 'nah', 'pan', 'pec', 'tec', 'tepec', 'titlan', 'tl', 'tlan', 'tzin', 'yan'],
                titles: ['Empire', 'Altepetl', 'Tlatoani', 'Confederation'],
                nameStyle: 'agglutinative'
            },

            // African (inspired by Swahili/Bantu) - vowel harmony, musical
            african: {
                weight: 6,
                phonemes: {
                    onsets: ['', 'b', 'ch', 'd', 'dh', 'f', 'g', 'gh', 'h', 'j', 'k', 'kh', 'l', 'm', 'mb', 'n', 'nd', 'ng', 'nj', 'ny', 'p', 'r', 's', 'sh', 't', 'th', 'v', 'w', 'y', 'z'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'aa', 'ee', 'ii', 'oo', 'uu', 'ai', 'au', 'ei', 'ia', 'ua'],
                    codas: ['', 'k', 'l', 'm', 'n', 'ng', 'r', 's', 'z']
                },
                roots: ['aba', 'aka', 'bama', 'bwana', 'duma', 'fari', 'goma', 'haki', 'imba', 'jali', 'kasi', 'lamu', 'maji', 'nchi', 'nyota', 'pori', 'radi', 'saba', 'tamu', 'uji', 'vuma', 'wazi', 'zuri'],
                prefixes: ['Aba', 'Aka', 'Bama', 'Bula', 'Bwana', 'Duma', 'Fari', 'Goma', 'Haki', 'Imba', 'Jali', 'Kali', 'Kasi', 'Lamu', 'Maji', 'Mbwa', 'Nchi', 'Ngoma', 'Nyota', 'Pori', 'Radi', 'Saba', 'Simba', 'Tamu', 'Uji', 'Vuma', 'Wazi', 'Zuri'],
                suffixes: ['a', 'ala', 'ana', 'anga', 'ani', 'ari', 'asi', 'ata', 'awa', 'ele', 'eni', 'era', 'eza', 'i', 'ia', 'ika', 'ila', 'ima', 'ini', 'ira', 'isha', 'isi', 'ita', 'o', 'ola', 'ona', 'u', 'ula', 'uma', 'ura', 'uzi'],
                titles: ['Kingdom', 'Chiefdom', 'Empire', 'Federation', 'Union'],
                nameStyle: 'vowel-rich'
            },

            // Elvish/High Fantasy - ethereal, flowing
            elvish: {
                weight: 8,
                phonemes: {
                    onsets: ['', 'c', 'ch', 'd', 'dh', 'f', 'g', 'gl', 'gw', 'h', 'l', 'll', 'm', 'n', 'nd', 'ng', 'p', 'ph', 'r', 'rh', 's', 'th', 'v', 'w'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'au', 'ea', 'ei', 'ia', 'ie', 'io', 'iu', 'oe', 'oi', 'ui'],
                    codas: ['', 'd', 'dh', 'l', 'll', 'm', 'n', 'nd', 'ng', 'nn', 'r', 'rn', 's', 'ss', 'th']
                },
                roots: ['ael', 'aer', 'ald', 'ar', 'cel', 'dir', 'dor', 'el', 'end', 'er', 'fae', 'fin', 'gal', 'gil', 'glor', 'il', 'ith', 'lam', 'lin', 'lir', 'lor', 'loth', 'mel', 'mir', 'mor', 'nar', 'nil', 'nor', 'quel', 'ril', 'rim', 'sir', 'sil', 'tal', 'tar', 'tel', 'thal', 'thil', 'thir', 'tir', 'val', 'vir', 'wen'],
                prefixes: ['Ael', 'Aer', 'Ald', 'Ar', 'Cel', 'Dir', 'Dor', 'El', 'End', 'Er', 'Fae', 'Fin', 'Gal', 'Gil', 'Glor', 'Il', 'Ith', 'Lam', 'Lin', 'Lir', 'Lor', 'Loth', 'Mel', 'Mir', 'Mor', 'Nar', 'Nil', 'Nor', 'Quel', 'Ril', 'Rim', 'Ser', 'Sil', 'Sul', 'Tal', 'Tar', 'Tel', 'Thal', 'Thil', 'Thir', 'Tir', 'Val', 'Vir', 'Wen'],
                suffixes: ['a', 'ael', 'aer', 'al', 'an', 'and', 'ar', 'ath', 'dil', 'dor', 'drim', 'duin', 'el', 'ell', 'en', 'eth', 'ia', 'ien', 'il', 'in', 'ion', 'ir', 'is', 'ith', 'las', 'lin', 'linn', 'lond', 'lor', 'los', 'mir', 'moth', 'nor', 'ond', 'or', 'oth', 'ril', 'rim', 'rin', 'rond', 'ros', 'thil', 'thir', 'wen', 'weth'],
                titles: ['Realm', 'Dominion', 'Kingdom', 'Wood', 'Haven'],
                nameStyle: 'ethereal'
            },

            // Dwarven/Underground - harsh, runic
            dwarven: {
                weight: 6,
                phonemes: {
                    onsets: ['', 'b', 'br', 'd', 'dr', 'dw', 'f', 'g', 'gl', 'gn', 'gr', 'h', 'k', 'kh', 'kr', 'l', 'm', 'n', 'r', 's', 'sk', 'st', 'str', 't', 'th', 'thr', 'v', 'z'],
                    nuclei: ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'au', 'oi', 'ou'],
                    codas: ['', 'd', 'g', 'k', 'l', 'ld', 'lf', 'lg', 'lk', 'll', 'lm', 'ln', 'ls', 'lt', 'm', 'n', 'nd', 'ng', 'nk', 'nn', 'r', 'rd', 'rg', 'rk', 'rl', 'rm', 'rn', 'rs', 'rt', 'rv', 'rz', 's', 'sk', 'st', 't', 'th', 'x', 'z']
                },
                roots: ['bar', 'bol', 'bor', 'dal', 'dar', 'dor', 'drak', 'dun', 'dur', 'fal', 'gal', 'gim', 'glim', 'glor', 'gol', 'grim', 'gund', 'hald', 'kal', 'kar', 'khaz', 'kol', 'mith', 'mor', 'nol', 'nor', 'rak', 'ril', 'rok', 'thal', 'thor', 'thrak', 'thror', 'tor', 'val', 'zar', 'zul'],
                prefixes: ['Amon', 'Bar', 'Bol', 'Bor', 'Dal', 'Dar', 'Dol', 'Dor', 'Drak', 'Dun', 'Dur', 'Fal', 'Gal', 'Gim', 'Glim', 'Glor', 'Gol', 'Grim', 'Gund', 'Hald', 'Iron', 'Kal', 'Kar', 'Khaz', 'Khel', 'Kol', 'Mith', 'Mor', 'Nol', 'Nor', 'Rak', 'Ril', 'Rok', 'Stone', 'Thal', 'Thor', 'Thrak', 'Thror', 'Tor', 'Val', 'Zar', 'Zul'],
                suffixes: ['ad', 'ak', 'ald', 'an', 'and', 'ar', 'ard', 'az', 'barak', 'dal', 'dan', 'dar', 'daz', 'din', 'dol', 'dor', 'drak', 'drek', 'drin', 'drol', 'drum', 'dun', 'dur', 'gard', 'grim', 'grod', 'grok', 'grom', 'gul', 'gund', 'had', 'hal', 'hold', 'in', 'kar', 'kazad', 'lin', 'lund', 'mak', 'mar', 'mok', 'mond', 'mun', 'nak', 'nir', 'ok', 'ol', 'on', 'or', 'rim', 'rin', 'rok', 'rum', 'thak', 'thal', 'thor', 'thul', 'ul', 'und', 'ur', 'zad', 'zak', 'zar', 'zul'],
                titles: ['Hold', 'Kingdom', 'Realm', 'Clan', 'Stronghold'],
                nameStyle: 'runic'
            },

            // Orcish/Tribal - guttural, aggressive
            orcish: {
                weight: 4,
                phonemes: {
                    onsets: ['', 'b', 'br', 'd', 'dr', 'g', 'gh', 'gl', 'gn', 'gr', 'h', 'k', 'kr', 'kh', 'm', 'n', 'r', 'sk', 'sn', 'sh', 't', 'th', 'thr', 'v', 'z', 'zg', 'zr'],
                    nuclei: ['a', 'o', 'u', 'aa', 'oo', 'uu', 'og', 'ug', 'ag'],
                    codas: ['', 'b', 'd', 'g', 'gh', 'gk', 'k', 'kh', 'm', 'n', 'ng', 'nk', 'r', 'rg', 'rk', 'rm', 'rn', 'sh', 'sk', 't', 'th', 'z', 'zg', 'zk']
                },
                roots: ['brak', 'drak', 'ghar', 'glob', 'gork', 'grag', 'grak', 'grim', 'grob', 'grom', 'gruk', 'krosh', 'mak', 'mok', 'mork', 'nag', 'nazg', 'ork', 'rok', 'shak', 'skrag', 'snak', 'snot', 'thrak', 'ulag', 'urg', 'vrak', 'wagh', 'zag', 'zog', 'zug'],
                prefixes: ['Brak', 'Drak', 'Ghar', 'Glob', 'Gork', 'Grag', 'Grak', 'Grim', 'Grob', 'Grom', 'Gruk', 'Krag', 'Krosh', 'Mak', 'Mok', 'Mork', 'Nag', 'Nazg', 'Og', 'Ork', 'Rok', 'Shak', 'Skrag', 'Snak', 'Snot', 'Thrak', 'Ulag', 'Urg', 'Vrak', 'Wagh', 'Zag', 'Zog', 'Zug'],
                suffixes: ['ab', 'ad', 'ag', 'ak', 'ash', 'ath', 'az', 'bag', 'bul', 'dak', 'dug', 'dush', 'gab', 'gash', 'gath', 'ghul', 'glob', 'gob', 'gosh', 'grat', 'grob', 'grod', 'grog', 'grub', 'gruk', 'gul', 'gur', 'kul', 'lug', 'mok', 'nob', 'nog', 'nok', 'og', 'ok', 'rak', 'rot', 'ruk', 'shak', 'thak', 'trog', 'ub', 'ug', 'uk', 'ul', 'um', 'ur', 'ush', 'uz', 'zag', 'zog', 'zug'],
                titles: ['Horde', 'Warband', 'Clan', 'Tribe'],
                nameStyle: 'guttural'
            }
        };

        // Calculate total weight
        this.totalCultureWeight = Object.values(this.cultures).reduce((sum, c) => sum + c.weight, 0);
    }

    /**
     * Initialize name components (titles, descriptors, etc.)
     */
    _initializeNameComponents() {
        // Government types with weights
        this.governmentTypes = [
            { prefix: 'Kingdom of', weight: 28 },
            { prefix: 'Realm of', weight: 15 },
            { prefix: 'Duchy of', weight: 14 },
            { prefix: 'Empire of', weight: 8 },
            { prefix: 'Republic of', weight: 8 },
            { prefix: 'Grand Duchy of', weight: 6 },
            { prefix: 'Principality of', weight: 6 },
            { prefix: 'Dominion of', weight: 5 },
            { prefix: 'Crown of', weight: 5 },
            { prefix: 'County of', weight: 5 },
            { prefix: 'March of', weight: 4 },
            { prefix: 'Archduchy of', weight: 3 },
            { prefix: 'Barony of', weight: 3 },
            { prefix: 'Commonwealth of', weight: 3 },
            { prefix: 'Confederation of', weight: 3 },
            { prefix: 'Free City of', weight: 3 },
            { prefix: 'Province of', weight: 3 },
            { prefix: 'Sultanate of', weight: 3 },
            { prefix: 'Khanate of', weight: 3 },
            { prefix: 'Throne of', weight: 2 },
            { prefix: 'House of', weight: 2 },
            { prefix: 'Protectorate of', weight: 2 },
            { prefix: 'Electorate of', weight: 2 },
            { prefix: 'Shogunate of', weight: 2 },
            { prefix: 'Emirate of', weight: 2 },
            { prefix: 'Hegemony of', weight: 1 },
            { prefix: 'League of', weight: 1 }
        ];
        this.totalGovWeight = this.governmentTypes.reduce((sum, g) => sum + g.weight, 0);

        // Descriptive adjectives for various name types
        this.adjectives = {
            terrain: ['Northern', 'Southern', 'Eastern', 'Western', 'Central', 'Upper', 'Lower', 'Inner', 'Outer', 'High', 'Low', 'Greater', 'Lesser'],
            quality: ['Golden', 'Silver', 'Iron', 'Crystal', 'Emerald', 'Sapphire', 'Ruby', 'Crimson', 'Azure', 'Verdant', 'Amber', 'Obsidian', 'Ivory', 'Ebony'],
            nature: ['Ancient', 'Wild', 'Sacred', 'Hidden', 'Lost', 'Forgotten', 'Eternal', 'Endless', 'Everlasting', 'Timeless'],
            mood: ['Dark', 'Bright', 'Shadow', 'Storm', 'Thunder', 'Misty', 'Silent', 'Whispering', 'Singing', 'Weeping', 'Laughing', 'Dreaming'],
            weather: ['Frozen', 'Blazing', 'Sunlit', 'Moonlit', 'Starlit', 'Windswept', 'Stormy', 'Calm', 'Peaceful'],
            size: ['Vast', 'Great', 'Mighty', 'Grand', 'Towering', 'Sprawling', 'Expansive', 'Boundless']
        };

        // Terrain and geographic features
        this.terrainTypes = {
            land: ['Lands', 'Plains', 'Fields', 'Reaches', 'Expanse', 'Territory', 'Domain', 'Frontier'],
            elevated: ['Hills', 'Highlands', 'Heights', 'Uplands', 'Bluffs', 'Mounds', 'Ridges', 'Crests'],
            lowland: ['Lowlands', 'Valleys', 'Dales', 'Hollows', 'Glens', 'Vales', 'Basins', 'Depressions'],
            wild: ['Wilds', 'Wilderness', 'Wastes', 'Badlands', 'Barrens', 'Marches', 'Borderlands'],
            coastal: ['Shores', 'Coast', 'Coastlands', 'Strand', 'Littoral', 'Seaboard'],
            wetland: ['Marshes', 'Swamps', 'Bogs', 'Fens', 'Mires', 'Wetlands', 'Moors'],
            dry: ['Steppes', 'Savanna', 'Prairie', 'Grasslands', 'Meadows', 'Pastures'],
            desert: ['Desert', 'Sands', 'Dunes', 'Wastes', 'Expanse']
        };

        // Mountain-related terms
        this.mountainTerms = {
            single: ['Mount', 'Peak', 'Summit', 'Spire', 'Horn', 'Crown', 'Crest', 'Pinnacle', 'Tor', 'Heights'],
            range: ['Mountains', 'Range', 'Peaks', 'Alps', 'Cordillera', 'Massif', 'Sierra', 'Ridge'],
            descriptive: ['Iron', 'Stone', 'Grey', 'White', 'Black', 'Red', 'Blue', 'Frost', 'Storm', 'Thunder', 'Dragon', 'Giant', 'Titan', 'Misty', 'Shadow', 'Lonely', 'Ancient', 'Eternal', 'Jagged', 'Broken', 'Shattered']
        };

        // Forest-related terms
        this.forestTerms = {
            type: ['Forest', 'Wood', 'Woods', 'Grove', 'Weald', 'Woodland', 'Thicket', 'Copse', 'Glade', 'Stand'],
            descriptive: ['Dark', 'Deep', 'Ancient', 'Enchanted', 'Whispering', 'Silent', 'Shadow', 'Golden', 'Emerald', 'Wild', 'Sacred', 'Forbidden', 'Haunted', 'Tangled', 'Verdant', 'Primeval', 'Endless', 'Twilight']
        };

        // Water body terms
        this.waterTerms = {
            flowing: ['River', 'Stream', 'Brook', 'Creek', 'Run', 'Beck', 'Burn', 'Rill', 'Runnel'],
            still: ['Lake', 'Loch', 'Mere', 'Pool', 'Pond', 'Tarn', 'Lagoon'],
            ocean: ['Sea', 'Ocean', 'Waters', 'Deep', 'Abyss'],
            coastal: ['Bay', 'Gulf', 'Strait', 'Sound', 'Channel', 'Inlet', 'Cove', 'Harbor', 'Haven'],
            descriptive: ['Azure', 'Emerald', 'Golden', 'Silver', 'Crystal', 'Endless', 'Stormy', 'Northern', 'Southern', 'Inner', 'Outer', 'Frozen', 'Sunlit', 'Moonlit', 'Whispering', 'Singing', 'Silent', 'Tranquil']
        };

        // Settlement prefixes
        this.settlementPrefixes = ['Port', 'Fort', 'New', 'Old', 'High', 'Low', 'East', 'West', 'North', 'South', 'Upper', 'Lower', 'Greater', 'Lesser', 'Saint', 'Castle', 'Tower', 'Bridge'];

        // Inn/tavern components
        this.innComponents = {
            adjectives: ['Golden', 'Silver', 'Iron', 'Copper', 'Bronze', 'Rusty', 'Gilded', 'Crimson', 'Azure', 'Emerald', 'Jade', 'Amber', 'Scarlet', 'Ivory', 'Ebony', 'Jolly', 'Merry', 'Happy', 'Lucky', 'Prancing', 'Dancing', 'Laughing', 'Sleeping', 'Roaring', 'Howling', 'Singing', 'Wandering', 'Drunken', 'Weary', 'Hungry', 'Thirsty', 'Blind', 'Three-Legged', 'One-Eyed', 'Fat', 'Thin', 'Old', 'Young', 'Wise', 'Foolish', 'Brave', 'Noble', 'Royal', 'Broken', 'Crooked', 'Hidden', 'Secret', 'Lost', 'Found', 'Last', 'First', 'Final'],
            creatures: ['Dragon', 'Griffin', 'Phoenix', 'Unicorn', 'Pegasus', 'Wyrm', 'Serpent', 'Lion', 'Bear', 'Wolf', 'Fox', 'Stag', 'Hart', 'Boar', 'Eagle', 'Hawk', 'Raven', 'Crow', 'Owl', 'Swan', 'Heron', 'Horse', 'Mare', 'Stallion', 'Hound', 'Cat', 'Rat', 'Badger', 'Otter', 'Salmon', 'Trout', 'Cod', 'Whale', 'Kraken', 'Mermaid', 'Giant', 'Troll', 'Goblin', 'Dwarf', 'Elf', 'Fairy', 'Sprite', 'Witch', 'Wizard', 'Knight', 'King', 'Queen', 'Prince', 'Princess', 'Lord', 'Lady', 'Baron', 'Duke', 'Jester', 'Fool', 'Pilgrim', 'Traveler', 'Wanderer', 'Sailor', 'Fisherman', 'Hunter', 'Blacksmith', 'Brewer'],
            objects: ['Crown', 'Sword', 'Shield', 'Axe', 'Hammer', 'Anvil', 'Chalice', 'Goblet', 'Tankard', 'Flagon', 'Barrel', 'Keg', 'Anchor', 'Wheel', 'Compass', 'Star', 'Moon', 'Sun', 'Key', 'Lock', 'Lantern', 'Candle', 'Torch', 'Bell', 'Horn', 'Drum', 'Harp', 'Lute', 'Fiddle', 'Pipe', 'Boot', 'Glove', 'Hat', 'Cloak', 'Ring', 'Gem', 'Pearl', 'Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Coin', 'Purse', 'Chest', 'Cart', 'Wagon', 'Ship', 'Boat', 'Bridge', 'Gate', 'Tower', 'Castle', 'Tree', 'Oak', 'Rose', 'Thistle', 'Shamrock', 'Wheat', 'Barley', 'Hop'],
            establishments: ['Inn', 'Tavern', 'Pub', 'Alehouse', 'Taproom', 'Lodge', 'Rest', 'House', 'Hall', 'Den', 'Lair', 'Refuge', 'Haven', 'Retreat', 'Hostel', 'Arms']
        };

        // Noble house components
        this.houseComponents = {
            prefixes: ['von', 'de', 'di', 'van', 'del', 'della', 'du', 'des', 'le', 'la', 'al', 'el', 'mac', 'mc', "o'", 'fitz'],
            virtues: ['Valor', 'Honor', 'Glory', 'Might', 'Pride', 'Wisdom', 'Justice', 'Mercy', 'Faith', 'Hope', 'Fortune', 'Destiny', 'Legacy', 'Heritage', 'Triumph', 'Victory'],
            elements: ['Iron', 'Steel', 'Stone', 'Fire', 'Frost', 'Storm', 'Thunder', 'Shadow', 'Light', 'Sun', 'Moon', 'Star', 'Wind', 'Wave', 'Flame', 'Ice'],
            animals: ['Lion', 'Dragon', 'Eagle', 'Wolf', 'Bear', 'Stag', 'Hawk', 'Raven', 'Griffin', 'Serpent', 'Phoenix', 'Boar', 'Horse', 'Hart', 'Falcon', 'Owl'],
            colors: ['Black', 'White', 'Red', 'Gold', 'Silver', 'Green', 'Blue', 'Crimson', 'Azure', 'Amber']
        };

        // Ship name components
        this.shipComponents = {
            adjectives: ['Swift', 'Bold', 'Proud', 'Fierce', 'Mighty', 'Royal', 'Noble', 'Brave', 'Golden', 'Silver', 'Iron', 'Storm', 'Thunder', 'Wind', 'Sea', 'Ocean', 'Eternal', 'Victorious', 'Glorious', 'Fearless', 'Relentless', 'Vengeful', 'Silent', 'Shadow', 'Crimson', 'Azure', 'Emerald', 'Black', 'White', 'Grey', 'Dark', 'Bright'],
            nouns: ['Maiden', 'Lady', 'Queen', 'Princess', 'Duchess', 'Mermaid', 'Siren', 'Nymph', 'Fortune', 'Destiny', 'Glory', 'Honor', 'Victory', 'Triumph', 'Revenge', 'Vengeance', 'Spirit', 'Soul', 'Dream', 'Hope', 'Dawn', 'Dusk', 'Star', 'Sun', 'Moon', 'Tempest', 'Storm', 'Thunder', 'Lightning', 'Wave', 'Tide', 'Current', 'Wind', 'Breeze', 'Gale', 'Dragon', 'Serpent', 'Kraken', 'Leviathan', 'Phoenix', 'Eagle', 'Hawk', 'Raven', 'Swan', 'Albatross', 'Trident', 'Crown', 'Scepter', 'Sword', 'Shield'],
            prefixes: ['HMS', 'SS', 'RMS', 'The', '']
        };

        // Personal name components
        this.personalNames = {
            male: {
                germanic: ['Aldric', 'Baldric', 'Conrad', 'Dietrich', 'Edmund', 'Friedrich', 'Gerhard', 'Heinrich', 'Ingmar', 'Johann', 'Karl', 'Ludwig', 'Magnus', 'Norbert', 'Otto', 'Peter', 'Reinhard', 'Stefan', 'Ulrich', 'Werner'],
                norse: ['Arne', 'Bjorn', 'Erik', 'Finn', 'Gunnar', 'Harald', 'Ivar', 'Knut', 'Leif', 'Magnus', 'Njal', 'Olaf', 'Ragnar', 'Sigurd', 'Thor', 'Ulf', 'Vidar', 'Yngve'],
                celtic: ['Aidan', 'Brennan', 'Cormac', 'Declan', 'Eamon', 'Finn', 'Galen', 'Killian', 'Liam', 'Niall', 'Owen', 'Patrick', 'Quinn', 'Ronan', 'Sean', 'Tiernan'],
                romance: ['Alessandro', 'Benito', 'Carlo', 'Dante', 'Emilio', 'Francesco', 'Giovanni', 'Lorenzo', 'Marco', 'Niccolo', 'Pietro', 'Rafael', 'Salvatore', 'Vincenzo'],
                slavic: ['Alexei', 'Boris', 'Dmitri', 'Fyodor', 'Grigori', 'Igor', 'Ivan', 'Konstantin', 'Mikhail', 'Nikolai', 'Pavel', 'Sergei', 'Viktor', 'Vladimir', 'Yuri'],
                hellenic: ['Alexandros', 'Christos', 'Dimitrios', 'Georgios', 'Ioannis', 'Konstantinos', 'Leonidas', 'Nikolaos', 'Petros', 'Stavros', 'Theodoros'],
                arabic: ['Ahmed', 'Farid', 'Hassan', 'Ibrahim', 'Jamal', 'Khalid', 'Mahmud', 'Omar', 'Rashid', 'Salim', 'Tariq', 'Yusuf', 'Zahir'],
                eastasian: ['Akira', 'Daichi', 'Haru', 'Kaito', 'Kenji', 'Ryu', 'Shin', 'Takeshi', 'Yamato', 'Yuki']
            },
            female: {
                germanic: ['Adelheid', 'Brunhilde', 'Elfriede', 'Gisela', 'Hildegard', 'Ingrid', 'Liesel', 'Mathilde', 'Rosalind', 'Sieglinde', 'Ursula', 'Waltraud'],
                norse: ['Astrid', 'Freyja', 'Gudrun', 'Helga', 'Ingeborg', 'Liv', 'Sigrid', 'Solveig', 'Thyra', 'Ylva'],
                celtic: ['Aisling', 'Brigid', 'Ciara', 'Deirdre', 'Fiona', 'Grainne', 'Maeve', 'Niamh', 'Roisin', 'Siobhan'],
                romance: ['Alessandra', 'Bianca', 'Chiara', 'Elena', 'Francesca', 'Giulia', 'Isabella', 'Lucia', 'Maria', 'Sofia', 'Valentina'],
                slavic: ['Anastasia', 'Ekaterina', 'Irina', 'Katya', 'Mila', 'Natasha', 'Olga', 'Svetlana', 'Tatiana', 'Yelena'],
                hellenic: ['Athena', 'Callista', 'Daphne', 'Helena', 'Iris', 'Lydia', 'Melina', 'Sophia', 'Thalia', 'Zoe'],
                arabic: ['Amira', 'Fatima', 'Layla', 'Nadia', 'Samira', 'Yasmin', 'Zahra'],
                eastasian: ['Akiko', 'Hanako', 'Keiko', 'Mei', 'Sakura', 'Yuki', 'Yumi']
            }
        };

        // Artifact components
        this.artifactComponents = {
            prefixes: ['Ancient', 'Blessed', 'Cursed', 'Divine', 'Enchanted', 'Eternal', 'Legendary', 'Lost', 'Mythic', 'Sacred', 'Holy', 'Unholy', 'Dark', 'Light', 'Shadow', 'Radiant'],
            types: {
                weapons: ['Sword', 'Blade', 'Axe', 'Hammer', 'Mace', 'Spear', 'Lance', 'Bow', 'Staff', 'Dagger', 'Scythe', 'Trident', 'Halberd', 'Flail', 'Glaive'],
                armor: ['Shield', 'Helm', 'Crown', 'Armor', 'Gauntlet', 'Bracer', 'Greaves', 'Boots', 'Cloak', 'Mantle', 'Robe', 'Mail', 'Plate'],
                jewelry: ['Ring', 'Amulet', 'Pendant', 'Necklace', 'Crown', 'Circlet', 'Bracelet', 'Brooch', 'Orb', 'Scepter'],
                misc: ['Tome', 'Scroll', 'Chalice', 'Grail', 'Horn', 'Mirror', 'Crystal', 'Stone', 'Key', 'Lantern', 'Compass', 'Map', 'Relic']
            },
            suffixes: ['of Power', 'of Might', 'of Fury', 'of Wrath', 'of Justice', 'of Mercy', 'of Wisdom', 'of Truth', 'of Lies', 'of Shadows', 'of Light', 'of Darkness', 'of Fire', 'of Ice', 'of Thunder', 'of Storms', 'of the Void', 'of the Abyss', 'of the Deep', 'of the Fallen', 'of the Chosen', 'of the Damned', 'of the Blessed', 'of Eternity', 'of Ages', 'of Legends', 'of Kings', 'of Queens', 'of Gods', 'of Mortals', 'of the Ancients', 'of the First', 'of the Last']
        };

        // Deity components
        this.deityComponents = {
            domains: ['War', 'Peace', 'Death', 'Life', 'Fire', 'Water', 'Earth', 'Air', 'Sun', 'Moon', 'Stars', 'Sky', 'Sea', 'Storm', 'Thunder', 'Lightning', 'Harvest', 'Hunt', 'Forge', 'Knowledge', 'Wisdom', 'Magic', 'Fate', 'Fortune', 'Love', 'Beauty', 'Justice', 'Vengeance', 'Chaos', 'Order', 'Time', 'Dreams', 'Shadows', 'Light', 'Darkness', 'Nature', 'Beasts', 'Plague', 'Healing', 'Wine', 'Revelry', 'Trickery', 'Secrets', 'Travel', 'Commerce', 'Crafts', 'Art', 'Poetry', 'Music'],
            titles: ['Father', 'Mother', 'Lord', 'Lady', 'King', 'Queen', 'Master', 'Mistress', 'Guardian', 'Keeper', 'Watcher', 'Bearer', 'Bringer', 'Giver', 'Taker', 'Ruler', 'Judge', 'Weaver', 'Maker', 'Breaker', 'Shaper', 'Destroyer', 'Creator', 'Preserver']
        };
    }

    /**
     * Build Markov chain models for each culture
     */
    _buildMarkovModels() {
        for (const [name, culture] of Object.entries(this.cultures)) {
            const model = { order2: {}, order3: {} };
            
            // Build from roots, prefixes, and suffixes
            const samples = [...culture.roots, ...culture.prefixes.map(p => p.toLowerCase()), ...culture.suffixes];
            
            for (const word of samples) {
                const padded = '^' + word + '$';
                
                // Order 2 model
                for (let i = 0; i < padded.length - 1; i++) {
                    const key = padded.slice(i, i + 2);
                    const next = padded[i + 2] || '';
                    if (!model.order2[key]) model.order2[key] = [];
                    if (next) model.order2[key].push(next);
                }
                
                // Order 3 model
                for (let i = 0; i < padded.length - 2; i++) {
                    const key = padded.slice(i, i + 3);
                    const next = padded[i + 3] || '';
                    if (!model.order3[key]) model.order3[key] = [];
                    if (next) model.order3[key].push(next);
                }
            }
            
            this.markovCache.set(name, model);
        }
    }

    // ============================================================
    // RANDOM UTILITIES
    // ============================================================

    /**
     * Reset generator state
     */
    reset() {
        this.usedNames.clear();
        this.seed = this.initialSeed;
    }

    /**
     * Set new seed
     */
    setSeed(seed) {
        this.seed = seed;
        this.initialSeed = seed;
    }

    /**
     * Seeded random number generator (LCG)
     */
    _random() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }

    /**
     * Random integer in range [min, max]
     */
    _randomInt(min, max) {
        return Math.floor(this._random() * (max - min + 1)) + min;
    }

    /**
     * Pick random element from array
     */
    _pick(arr) {
        if (!arr || arr.length === 0) return '';
        return arr[Math.floor(this._random() * arr.length)];
    }

    /**
     * Pick multiple unique random elements
     */
    _pickMultiple(arr, count) {
        const result = [];
        const available = [...arr];
        const n = Math.min(count, available.length);
        
        for (let i = 0; i < n; i++) {
            const idx = Math.floor(this._random() * available.length);
            result.push(available.splice(idx, 1)[0]);
        }
        
        return result;
    }

    /**
     * Weighted random selection
     */
    _pickWeighted(items, weightKey = 'weight') {
        const total = items.reduce((sum, item) => sum + (item[weightKey] || 1), 0);
        let random = this._random() * total;
        
        for (const item of items) {
            random -= item[weightKey] || 1;
            if (random <= 0) return item;
        }
        
        return items[0];
    }

    /**
     * Pick weighted random culture
     */
    _pickCulture() {
        let random = this._random() * this.totalCultureWeight;
        for (const [name, culture] of Object.entries(this.cultures)) {
            random -= culture.weight;
            if (random <= 0) return { name, culture };
        }
        return { name: 'germanic', culture: this.cultures.germanic };
    }

    /**
     * Get specific culture by name
     */
    _getCulture(cultureName) {
        return this.cultures[cultureName] || this.cultures.germanic;
    }

    // ============================================================
    // NAME GENERATION STRATEGIES
    // ============================================================

    /**
     * Generate name using Markov chain
     */
    _generateMarkov(culture, minLength = 4, maxLength = 12) {
        const cultureName = typeof culture === 'string' ? culture : culture.name || 'germanic';
        const model = this.markovCache.get(cultureName);
        
        if (!model) return this._generateCompound(this._getCulture(cultureName));
        
        // Try order 3 first, fall back to order 2
        for (let attempt = 0; attempt < 50; attempt++) {
            let name = '^';
            const useOrder3 = this._random() > 0.3;
            const orderModel = useOrder3 ? model.order3 : model.order2;
            const keyLength = useOrder3 ? 3 : 2;
            
            for (let i = 0; i < maxLength + 5; i++) {
                const key = name.slice(-keyLength);
                const options = orderModel[key];
                
                if (!options || options.length === 0) break;
                
                const next = this._pick(options);
                if (next === '$') break;
                
                name += next;
            }
            
            name = name.slice(1); // Remove starting ^
            
            if (name.length >= minLength && name.length <= maxLength && this._isValidName(name)) {
                return this._capitalize(name);
            }
        }
        
        // Fallback
        return this._generateCompound(this._getCulture(cultureName));
    }

    /**
     * Generate name using compound word approach (prefix + suffix)
     */
    _generateCompound(culture) {
        const prefix = this._pick(culture.prefixes);
        const suffix = this._pick(culture.suffixes);
        
        let name = prefix + suffix;
        name = this._smoothJunction(name, prefix.length);
        
        return this._capitalize(name);
    }

    /**
     * Generate name using syllable patterns
     */
    _generateSyllabic(culture, syllableCount = null) {
        const count = syllableCount || this._randomInt(2, 4);
        let name = '';
        
        for (let i = 0; i < count; i++) {
            const onset = this._pick(culture.phonemes.onsets);
            const nucleus = this._pick(culture.phonemes.nuclei);
            const coda = i === count - 1 ? this._pick(culture.phonemes.codas) : (this._random() > 0.6 ? this._pick(culture.phonemes.codas) : '');
            
            name += onset + nucleus + coda;
        }
        
        return this._capitalize(name);
    }

    /**
     * Generate name using root modification
     */
    _generateFromRoot(culture) {
        const root = this._pick(culture.roots);
        const suffix = this._pick(culture.suffixes);
        
        let name = root + suffix;
        name = this._smoothJunction(name, root.length);
        
        return this._capitalize(name);
    }

    /**
     * Generate a complete base name using mixed strategies
     */
    _generateBaseName(cultureName = null) {
        const { name: cName, culture } = cultureName 
            ? { name: cultureName, culture: this._getCulture(cultureName) }
            : this._pickCulture();
        
        const strategy = this._random();
        let name;
        
        if (strategy < 0.35) {
            // Markov chain
            name = this._generateMarkov(cName);
        } else if (strategy < 0.65) {
            // Compound
            name = this._generateCompound(culture);
        } else if (strategy < 0.85) {
            // Syllabic
            name = this._generateSyllabic(culture);
        } else {
            // Root-based
            name = this._generateFromRoot(culture);
        }
        
        // Ensure validity
        let attempts = 0;
        while (!this._isValidName(name) && attempts < 20) {
            name = this._generateCompound(culture);
            attempts++;
        }
        
        return name;
    }

    // ============================================================
    // NAME VALIDATION & CLEANUP
    // ============================================================

    /**
     * Check if name is phonetically valid
     */
    _isValidName(name) {
        if (!name || name.length < 3 || name.length > 14) return false;
        
        // Must contain at least one vowel
        if (!/[aeiouäöüæøåy]/i.test(name)) return false;
        
        // Check forbidden patterns
        for (const pattern of this.forbidden) {
            if (pattern.test(name)) return false;
        }
        
        // Additional quality checks
        // No more than 3 consonants in a row
        if (/[bcdfghjklmnpqrstvwxz]{4,}/i.test(name)) return false;
        
        // Reasonable vowel/consonant ratio
        const vowels = (name.match(/[aeiouäöüæøåy]/gi) || []).length;
        const ratio = vowels / name.length;
        if (ratio < 0.2 || ratio > 0.7) return false;
        
        return true;
    }

    /**
     * Smooth junction between prefix and suffix
     */
    _smoothJunction(name, junctionPoint) {
        if (junctionPoint <= 0 || junctionPoint >= name.length) return name;
        
        const before = name[junctionPoint - 1]?.toLowerCase();
        const after = name[junctionPoint]?.toLowerCase();
        
        if (!before || !after) return name;
        
        // Double consonant at junction
        if (before === after && !/[aeiou]/i.test(before)) {
            return name.slice(0, junctionPoint) + name.slice(junctionPoint + 1);
        }
        
        // Triple letters
        if (junctionPoint >= 2) {
            const beforeBefore = name[junctionPoint - 2]?.toLowerCase();
            if (beforeBefore === before && before === after) {
                return name.slice(0, junctionPoint) + name.slice(junctionPoint + 1);
            }
        }
        
        // Awkward vowel combinations
        const vowels = 'aeiouäöüæøåy';
        if (vowels.includes(before) && vowels.includes(after)) {
            // Sometimes remove one vowel
            if (before === after || this._random() > 0.7) {
                return name.slice(0, junctionPoint) + name.slice(junctionPoint + 1);
            }
        }
        
        return name;
    }

    /**
     * Capitalize name properly
     */
    _capitalize(name) {
        if (!name) return '';
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }

    /**
     * Clean up name
     */
    _cleanName(name) {
        return name
            .replace(/(.)\1{2,}/gi, '$1$1')  // Max 2 consecutive same letters
            .replace(/\s+/g, ' ')              // Single spaces
            .trim();
    }

    // ============================================================
    // MAIN GENERATION METHODS
    // ============================================================

    /**
     * Generate a kingdom/nation name
     */
    generateKingdomName(options = {}) {
        const { culture: cultureName, style } = options;
        
        const baseName = this._generateBaseName(cultureName);
        
        // Sometimes just return the name
        if (style === 'simple' || this._random() < 0.15) {
            return baseName;
        }
        
        // Add government type
        const gov = this._pickWeighted(this.governmentTypes);
        return `${gov.prefix} ${baseName}`;
    }

    /**
     * Generate a settlement/city name
     */
    generateSettlementName(options = {}) {
        const { culture: cultureName, size = 'medium', hasPrefix = null, isCoastal = false, isHighland = false, elevation = 0 } = options;
        
        const baseName = this._generateBaseName(cultureName);
        
        // Determine if prefix should be added
        const addPrefix = hasPrefix !== null 
            ? hasPrefix 
            : this._random() < (size === 'large' ? 0.3 : 0.15);
        
        if (addPrefix) {
            let prefix;
            
            // Context-aware prefix selection
            if (isCoastal && this._random() < 0.7) {
                // Coastal cities get port-related prefixes
                prefix = this._pick(['Port', 'Harbor', 'Bay', 'Cape', 'Cove', 'Wharf', 'Anchor', 'Tide', 'Salt', 'Sea']);
            } else if (isHighland && this._random() < 0.7) {
                // Highland cities get mountain-related prefixes
                prefix = this._pick(['High', 'Upper', 'Peak', 'Summit', 'Ridge', 'Crest', 'Mount', 'Stone', 'Eagle', 'Cloud']);
            } else if (elevation < 200 && this._random() < 0.5) {
                // Low-lying cities
                prefix = this._pick(['Low', 'Lower', 'Meadow', 'Green', 'Mill', 'Ford', 'Bridge', 'Market']);
            } else {
                // Generic prefixes (excluding coastal/highland specific ones)
                prefix = this._pick(['Fort', 'New', 'Old', 'East', 'West', 'North', 'South', 'Greater', 'Lesser', 'Saint', 'Castle', 'Tower', 'King\'s', 'Queen\'s']);
            }
            return `${prefix} ${baseName}`;
        }
        
        return baseName;
    }

    /**
     * Generate a region name
     */
    generateRegionName(options = {}) {
        const { culture: cultureName, type = 'any' } = options;
        
        const style = this._random();
        
        if (style < 0.45) {
            // Descriptive: "The Northern Highlands"
            const adj = this._pick([...this.adjectives.terrain, ...this.adjectives.quality, ...this.adjectives.mood]);
            
            let terrainCategory;
            if (type !== 'any' && this.terrainTypes[type]) {
                terrainCategory = this.terrainTypes[type];
            } else {
                const categories = Object.values(this.terrainTypes);
                terrainCategory = this._pick(categories);
            }
            
            const terrain = this._pick(terrainCategory);
            return `The ${adj} ${terrain}`;
        } else if (style < 0.75) {
            // Possessive: "Aldheim's Reach"
            const baseName = this._generateBaseName(cultureName);
            const suffix = this._pick(['Reach', 'Domain', 'Territory', 'Lands', 'Expanse', 'Frontier']);
            return `${baseName}'s ${suffix}`;
        } else {
            // Simple: "Thorndale"
            return this._generateBaseName(cultureName);
        }
    }

    /**
     * Generate a river name
     */
    generateRiverName(options = {}) {
        const { culture: cultureName, abbreviated = false } = options;
        const { culture } = cultureName 
            ? { culture: this._getCulture(cultureName) }
            : this._pickCulture();
        
        const style = this._random();
        
        if (style < 0.4) {
            // Simple: "Name River" or "Name R."
            const baseName = this._pick(culture.prefixes);
            const suffix = abbreviated ? ' R.' : ' River';
            return baseName + suffix;
        } else if (style < 0.65) {
            // Compound: "Silverbrook", "Coldwater"
            const prefix = this._pick(culture.prefixes);
            const riverSuffix = this._pick(['brook', 'burn', 'beck', 'water', 'run', 'stream']);
            return this._capitalize(prefix.toLowerCase() + riverSuffix);
        } else if (style < 0.85) {
            // Descriptive: "The Swift River", "Blue R."
            const adj = this._pick(['Swift', 'Blue', 'White', 'Black', 'Red', 'Clear', 'Dark', 'Long', 'Great', 'Old', 'Cold', 'Winding', 'Rushing', 'Gentle', 'Wild', 'Golden', 'Silver']);
            const suffix = abbreviated ? ' R.' : ' River';
            return `${adj}${suffix}`;
        } else {
            // Named: "River Aldstone"
            const baseName = this._generateBaseName(cultureName);
            return `River ${baseName}`;
        }
    }

    /**
     * Generate a mountain name
     */
    generateMountainName(options = {}) {
        const { culture: cultureName, isRange = false } = options;
        
        const style = this._random();
        
        if (isRange || style > 0.65) {
            // Range name
            if (this._random() < 0.5) {
                // Descriptive: "The Iron Mountains"
                const adj = this._pick(this.mountainTerms.descriptive);
                const type = this._pick(this.mountainTerms.range);
                return `The ${adj} ${type}`;
            } else {
                // Named: "The Aldheim Mountains"
                const baseName = this._generateBaseName(cultureName);
                const type = this._pick(this.mountainTerms.range);
                return `The ${baseName} ${type}`;
            }
        } else {
            // Single peak
            const baseName = this._generateBaseName(cultureName);
            const format = this._random();
            
            if (format < 0.4) {
                // "Mount Aldheim"
                return `Mount ${baseName}`;
            } else if (format < 0.7) {
                // "Aldheim Peak"
                const suffix = this._pick(this.mountainTerms.single);
                return `${baseName} ${suffix}`;
            } else {
                // "The Lonely Peak"
                const adj = this._pick(this.mountainTerms.descriptive);
                const type = this._pick(this.mountainTerms.single);
                return `The ${adj} ${type}`;
            }
        }
    }

    /**
     * Generate a forest name
     */
    generateForestName(options = {}) {
        const { culture: cultureName } = options;
        
        const style = this._random();
        
        if (style < 0.45) {
            // Descriptive: "The Dark Forest"
            const adj = this._pick(this.forestTerms.descriptive);
            const type = this._pick(this.forestTerms.type);
            return `The ${adj} ${type}`;
        } else if (style < 0.8) {
            // Named: "Aldwood", "Thornweald"
            const baseName = this._generateBaseName(cultureName);
            const type = this._pick(this.forestTerms.type);
            return `${baseName} ${type}`;
        } else {
            // Simple compound: "Darkwood"
            const adj = this._pick(this.forestTerms.descriptive);
            const type = this._pick(['wood', 'wood', 'weald', 'grove']);
            return this._capitalize(adj.toLowerCase() + type);
        }
    }

    /**
     * Generate a sea/ocean name
     */
    generateSeaName(options = {}) {
        const { culture: cultureName, type = 'any' } = options;
        
        const style = this._random();
        
        if (style < 0.35) {
            // Named: "Aldheim Sea"
            const baseName = this._generateBaseName(cultureName);
            const waterType = type !== 'any' ? type : this._pick(this.waterTerms.ocean);
            return `${baseName} ${waterType}`;
        } else if (style < 0.7) {
            // Descriptive: "The Azure Sea"
            const adj = this._pick(this.waterTerms.descriptive);
            const waterType = type !== 'any' ? type : this._pick(this.waterTerms.ocean);
            return `The ${adj} ${waterType}`;
        } else {
            // Coastal feature: "Bay of Aldheim"
            const baseName = this._generateBaseName(cultureName);
            const feature = this._pick(this.waterTerms.coastal);
            return `${feature} of ${baseName}`;
        }
    }

    /**
     * Generate a lake name
     */
    generateLakeName(options = {}) {
        const { culture: cultureName } = options;
        
        const style = this._random();
        const lakeType = this._pick(this.waterTerms.still);
        
        if (style < 0.5) {
            // "Lake Aldheim"
            const baseName = this._generateBaseName(cultureName);
            return `${lakeType} ${baseName}`;
        } else if (style < 0.75) {
            // "The Crystal Lake"
            const adj = this._pick(this.waterTerms.descriptive);
            return `The ${adj} ${lakeType}`;
        } else {
            // "Aldmere", "Silverpool"
            const prefix = this._pick(this._pickCulture().culture.prefixes);
            const suffix = this._pick(['mere', 'pool', 'tarn', 'loch', 'lake']);
            return this._capitalize(prefix.toLowerCase() + suffix);
        }
    }

    /**
     * Generate an inn/tavern name
     */
    generateInnName(options = {}) {
        const { style = 'any' } = options;
        
        const format = style !== 'any' ? style : this._pick(['adjective-creature', 'adjective-object', 'creature-object', 'number', 'possessive']);
        const establishment = this._pick(this.innComponents.establishments);
        
        let name;
        
        switch (format) {
            case 'adjective-creature':
                // "The Golden Dragon"
                name = `The ${this._pick(this.innComponents.adjectives)} ${this._pick(this.innComponents.creatures)}`;
                break;
            
            case 'adjective-object':
                // "The Rusty Anchor"
                name = `The ${this._pick(this.innComponents.adjectives)} ${this._pick(this.innComponents.objects)}`;
                break;
            
            case 'creature-object':
                // "The Dragon's Crown"
                name = `The ${this._pick(this.innComponents.creatures)}'s ${this._pick(this.innComponents.objects)}`;
                break;
            
            case 'number':
                // "The Three Crowns"
                const numbers = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
                const pluralObjects = ['Crowns', 'Swords', 'Shields', 'Stars', 'Moons', 'Keys', 'Bells', 'Barrels', 'Tankards', 'Coins'];
                name = `The ${this._pick(numbers)} ${this._pick(pluralObjects)}`;
                break;
            
            case 'possessive':
                // "The Wanderer's Rest"
                name = `The ${this._pick(this.innComponents.creatures)}'s ${establishment}`;
                break;
            
            default:
                name = `The ${this._pick(this.innComponents.adjectives)} ${this._pick(this.innComponents.creatures)}`;
        }
        
        // Sometimes add establishment type
        if (this._random() < 0.3 && !name.includes(establishment)) {
            name = `${name} ${establishment}`;
        }
        
        return name;
    }

    /**
     * Generate a noble house name
     */
    generateHouseName(options = {}) {
        const { culture: cultureName, style = 'any' } = options;
        
        const format = style !== 'any' ? style : this._pick(['simple', 'prefixed', 'compound', 'titled']);
        
        let name;
        
        switch (format) {
            case 'simple':
                // "House Aldric"
                name = this._generateBaseName(cultureName);
                break;
            
            case 'prefixed':
                // "House von Aldstein"
                const prefix = this._pick(this.houseComponents.prefixes);
                const baseName = this._generateBaseName(cultureName);
                name = `${prefix} ${baseName}`;
                break;
            
            case 'compound':
                // "House Ironwolf", "House Stormborn"
                const element = this._pick([...this.houseComponents.elements, ...this.houseComponents.colors]);
                const animal = this._pick(this.houseComponents.animals);
                name = this._capitalize(element.toLowerCase() + animal.toLowerCase());
                break;
            
            case 'titled':
                // "House of the Golden Lion"
                const color = this._pick(this.houseComponents.colors);
                const creature = this._pick(this.houseComponents.animals);
                return `House of the ${color} ${creature}`;
            
            default:
                name = this._generateBaseName(cultureName);
        }
        
        return `House ${name}`;
    }

    /**
     * Generate a ship name
     */
    generateShipName(options = {}) {
        const { hasPrefix = true, style = 'any' } = options;
        
        const format = style !== 'any' ? style : this._pick(['adjective-noun', 'the-noun', 'possessive', 'named']);
        const prefix = hasPrefix ? this._pick(this.shipComponents.prefixes) : '';
        
        let name;
        
        switch (format) {
            case 'adjective-noun':
                // "Swift Vengeance"
                name = `${this._pick(this.shipComponents.adjectives)} ${this._pick(this.shipComponents.nouns)}`;
                break;
            
            case 'the-noun':
                // "The Tempest"
                name = `The ${this._pick(this.shipComponents.nouns)}`;
                break;
            
            case 'possessive':
                // "Fortune's Favor"
                const noun1 = this._pick(this.shipComponents.nouns);
                const noun2 = this._pick(['Pride', 'Favor', 'Grace', 'Wrath', 'Fury', 'Dream', 'Promise', 'Bounty', 'Blessing', 'Curse']);
                name = `${noun1}'s ${noun2}`;
                break;
            
            case 'named':
                // A person's name
                name = this.generatePersonalName({ gender: 'female' });
                break;
            
            default:
                name = `${this._pick(this.shipComponents.adjectives)} ${this._pick(this.shipComponents.nouns)}`;
        }
        
        return prefix ? `${prefix} ${name}` : name;
    }

    /**
     * Generate a personal name
     */
    generatePersonalName(options = {}) {
        const { gender = 'any', culture: cultureName, includeSurname = false } = options;
        
        const actualGender = gender === 'any' ? (this._random() < 0.5 ? 'male' : 'female') : gender;
        const { name: cName } = cultureName 
            ? { name: cultureName }
            : this._pickCulture();
        
        // Map to available name lists
        const cultureMap = {
            germanic: 'germanic', norse: 'norse', celtic: 'celtic',
            romance: 'romance', slavic: 'slavic', hellenic: 'hellenic',
            arabic: 'arabic', eastasian: 'eastasian',
            elvish: 'celtic', dwarven: 'germanic', orcish: 'germanic',
            mesoamerican: 'romance', african: 'arabic'
        };
        
        const nameListCulture = cultureMap[cName] || 'germanic';
        const nameList = this.personalNames[actualGender][nameListCulture];
        
        let firstName;
        if (nameList && nameList.length > 0) {
            firstName = this._pick(nameList);
        } else {
            // Generate from syllables
            firstName = this._generateSyllabic(this._getCulture(cName), 2);
        }
        
        if (includeSurname) {
            const surname = this._generateBaseName(cName);
            return `${firstName} ${surname}`;
        }
        
        return firstName;
    }

    /**
     * Generate an artifact name
     */
    generateArtifactName(options = {}) {
        const { type = 'any', style = 'any' } = options;
        
        // Determine artifact type
        let itemType;
        if (type !== 'any' && this.artifactComponents.types[type]) {
            itemType = this._pick(this.artifactComponents.types[type]);
        } else {
            const allTypes = Object.values(this.artifactComponents.types).flat();
            itemType = this._pick(allTypes);
        }
        
        const format = style !== 'any' ? style : this._pick(['named', 'descriptive', 'titled', 'possessive']);
        
        switch (format) {
            case 'named':
                // "Dawnbreaker", "Stormbringer"
                const element = this._pick(['Dawn', 'Dusk', 'Storm', 'Shadow', 'Light', 'Fire', 'Frost', 'Soul', 'Blood', 'Moon', 'Sun', 'Star', 'Night', 'Dragon', 'Demon', 'Angel', 'Death', 'Life', 'Thunder', 'Wind', 'Doom', 'Fate', 'Glory', 'Chaos', 'Order']);
                const action = this._pick(['breaker', 'bringer', 'slayer', 'seeker', 'keeper', 'render', 'splitter', 'caller', 'waker', 'singer', 'weaver', 'reaver', 'bane', 'fall', 'rise', 'song', 'fire', 'fury', 'strike', 'edge']);
                return this._capitalize(element.toLowerCase() + action);
            
            case 'descriptive':
                // "The Cursed Blade"
                const prefix = this._pick(this.artifactComponents.prefixes);
                return `The ${prefix} ${itemType}`;
            
            case 'titled':
                // "Blade of the Fallen"
                const suffix = this._pick(this.artifactComponents.suffixes);
                return `${itemType} ${suffix}`;
            
            case 'possessive':
                // "Aldric's Hammer"
                const owner = this.generatePersonalName();
                return `${owner}'s ${itemType}`;
            
            default:
                return `The ${this._pick(this.artifactComponents.prefixes)} ${itemType}`;
        }
    }

    /**
     * Generate a deity name
     */
    generateDeityName(options = {}) {
        const { domain = 'any', culture: cultureName } = options;
        
        const actualDomain = domain !== 'any' ? domain : this._pick(this.deityComponents.domains);
        const title = this._pick(this.deityComponents.titles);
        
        const style = this._random();
        
        if (style < 0.4) {
            // Named: "Aldros, Lord of Thunder"
            const name = this._generateBaseName(cultureName);
            return `${name}, ${title} of ${actualDomain}`;
        } else if (style < 0.7) {
            // Titled: "The Storm Father"
            return `The ${actualDomain} ${title}`;
        } else {
            // Simple: "Aldros the Wise"
            const name = this._generateBaseName(cultureName);
            const epithet = this._pick(['Wise', 'Mighty', 'Eternal', 'Ancient', 'Terrible', 'Merciful', 'Just', 'Silent', 'Radiant', 'Dark', 'Golden', 'Silver', 'Great', 'All-Seeing', 'Ever-Living', 'Undying']);
            return `${name} the ${epithet}`;
        }
    }

    /**
     * Generate a battle/war name
     */
    generateBattleName(options = {}) {
        const { culture: cultureName } = options;
        
        const style = this._random();
        
        if (style < 0.4) {
            // Location: "Battle of Aldheim"
            const location = this._generateBaseName(cultureName);
            const prefix = this._pick(['Battle of', 'Siege of', 'Fall of', 'Defense of', 'Sack of', 'Conquest of']);
            return `${prefix} ${location}`;
        } else if (style < 0.7) {
            // Descriptive: "The Red Wedding", "The Long Night"
            const adj = this._pick(['Red', 'Black', 'White', 'Golden', 'Silver', 'Dark', 'Bright', 'Long', 'Last', 'First', 'Final', 'Great', 'Bloody', 'Silent', 'Burning', 'Frozen', 'Endless', 'Bitter', 'Glorious']);
            const noun = this._pick(['War', 'Rebellion', 'Uprising', 'Crusade', 'Campaign', 'March', 'Siege', 'Night', 'Day', 'Dawn', 'Dusk', 'Hour', 'Reckoning', 'Judgment', 'Fury', 'Storm', 'Winter', 'Summer', 'Harvest', 'Famine', 'Plague']);
            return `The ${adj} ${noun}`;
        } else {
            // Possessive: "Aldric's Folly"
            const name = this.generatePersonalName({ culture: cultureName });
            const outcome = this._pick(['Victory', 'Triumph', 'Glory', 'Folly', 'Fall', 'Stand', 'Last Stand', 'Revenge', 'Gambit', 'March', 'Charge', 'Crossing', 'Retreat']);
            return `${name}'s ${outcome}`;
        }
    }

    /**
     * Generate a guild/organization name
     */
    generateGuildName(options = {}) {
        const { type = 'any' } = options;
        
        const guildTypes = {
            merchant: ['Guild', 'Company', 'Trading Company', 'Consortium', 'Syndicate', 'Association', 'League'],
            craft: ['Guild', 'Brotherhood', 'Sisterhood', 'Order', 'Fellowship', 'Union', 'Lodge'],
            military: ['Order', 'Brotherhood', 'Company', 'Legion', 'Guard', 'Watch', 'Sentinels', 'Knights', 'Warriors'],
            arcane: ['Order', 'Circle', 'Conclave', 'Academy', 'College', 'Tower', 'Society', 'Covenant'],
            thieves: ['Guild', 'Brotherhood', 'Shadow', 'Syndicate', 'Ring', 'Network', 'Hand'],
            religious: ['Order', 'Brotherhood', 'Sisterhood', 'Temple', 'Church', 'Congregation', 'Covenant', 'Disciples']
        };
        
        const actualType = type !== 'any' ? type : this._pick(Object.keys(guildTypes));
        const guildType = this._pick(guildTypes[actualType] || guildTypes.merchant);
        
        const style = this._random();
        
        if (style < 0.4) {
            // Named: "The Aldheim Merchants' Guild"
            const baseName = this._generateBaseName();
            const profession = actualType === 'merchant' ? "Merchants'" : actualType === 'craft' ? "Craftsmen's" : '';
            return `The ${baseName} ${profession} ${guildType}`.replace(/\s+/g, ' ');
        } else if (style < 0.7) {
            // Descriptive: "The Silver Hand"
            const adj = this._pick(['Golden', 'Silver', 'Iron', 'Crimson', 'Azure', 'Emerald', 'Obsidian', 'Sacred', 'Hidden', 'Silent', 'Vigilant', 'Ancient']);
            const noun = this._pick(['Hand', 'Eye', 'Blade', 'Shield', 'Crown', 'Rose', 'Star', 'Moon', 'Sun', 'Dragon', 'Phoenix', 'Lion', 'Wolf', 'Raven', 'Serpent']);
            return `The ${adj} ${noun}`;
        } else {
            // Order style: "Order of the Crimson Dawn"
            const adj = this._pick(['Crimson', 'Golden', 'Silver', 'Eternal', 'Sacred', 'Hidden', 'Radiant', 'Shadow', 'Burning', 'Frozen']);
            const noun = this._pick(['Dawn', 'Dusk', 'Star', 'Moon', 'Sun', 'Flame', 'Storm', 'Veil', 'Rose', 'Thorn', 'Blade', 'Shield', 'Crown', 'Light', 'Shadow']);
            return `${guildType} of the ${adj} ${noun}`;
        }
    }

    // ============================================================
    // BATCH GENERATION
    // ============================================================

    /**
     * Generate multiple unique names
     */
    generateNames(count, type = 'settlement', options = {}) {
        const names = [];
        const maxAttempts = count * 10;
        let attempts = 0;
        
        while (names.length < count && attempts < maxAttempts) {
            attempts++;
            
            let name;
            
            switch (type) {
                case 'kingdom': name = this.generateKingdomName(options); break;
                case 'settlement': name = this.generateSettlementName(options); break;
                case 'city': name = this.generateSettlementName({ ...options, size: 'large' }); break;
                case 'region': name = this.generateRegionName(options); break;
                case 'river': name = this.generateRiverName(options); break;
                case 'mountain': name = this.generateMountainName(options); break;
                case 'forest': name = this.generateForestName(options); break;
                case 'sea': name = this.generateSeaName(options); break;
                case 'lake': name = this.generateLakeName(options); break;
                case 'inn': name = this.generateInnName(options); break;
                case 'house': name = this.generateHouseName(options); break;
                case 'ship': name = this.generateShipName(options); break;
                case 'person': name = this.generatePersonalName(options); break;
                case 'artifact': name = this.generateArtifactName(options); break;
                case 'deity': name = this.generateDeityName(options); break;
                case 'battle': name = this.generateBattleName(options); break;
                case 'guild': name = this.generateGuildName(options); break;
                case 'base': name = this._generateBaseName(options.culture); break;
                default: name = this._generateBaseName(options.culture);
            }
            
            const key = name.toLowerCase();
            if (!this.usedNames.has(key)) {
                this.usedNames.add(key);
                names.push(name);
            }
        }
        
        return names;
    }

    /**
     * Generate a cohesive set of names for a region (all same culture)
     */
    generateRegionalNames(options = {}) {
        const {
            culture: cultureName,
            kingdoms = 1,
            settlements = 5,
            rivers = 2,
            mountains = 1,
            forests = 1,
            lakes = 1
        } = options;
        
        const { name: cName } = cultureName 
            ? { name: cultureName }
            : this._pickCulture();
        
        const cultureOpts = { culture: cName };
        
        return {
            culture: cName,
            kingdoms: this.generateNames(kingdoms, 'kingdom', cultureOpts),
            settlements: this.generateNames(settlements, 'settlement', cultureOpts),
            rivers: this.generateNames(rivers, 'river', cultureOpts),
            mountains: this.generateNames(mountains, 'mountain', cultureOpts),
            forests: this.generateNames(forests, 'forest', cultureOpts),
            lakes: this.generateNames(lakes, 'lake', cultureOpts)
        };
    }

    /**
     * Get all available cultures
     */
    getCultures() {
        return Object.keys(this.cultures);
    }

    /**
     * Get all available name types
     */
    getNameTypes() {
        return [
            'kingdom', 'settlement', 'city', 'region', 'river', 'mountain',
            'forest', 'sea', 'lake', 'inn', 'house', 'ship', 'person',
            'artifact', 'deity', 'battle', 'guild', 'base'
        ];
    }
}

// Default export
export const nameGenerator = new NameGenerator();

// Quick generation functions
export function generateKingdomName(options) { return nameGenerator.generateKingdomName(options); }
export function generateSettlementName(options) { return nameGenerator.generateSettlementName(options); }
export function generateRegionName(options) { return nameGenerator.generateRegionName(options); }
export function generateRiverName(options) { return nameGenerator.generateRiverName(options); }
export function generateMountainName(options) { return nameGenerator.generateMountainName(options); }
export function generateForestName(options) { return nameGenerator.generateForestName(options); }
export function generateSeaName(options) { return nameGenerator.generateSeaName(options); }
export function generateLakeName(options) { return nameGenerator.generateLakeName(options); }
export function generateInnName(options) { return nameGenerator.generateInnName(options); }
export function generateHouseName(options) { return nameGenerator.generateHouseName(options); }
export function generateShipName(options) { return nameGenerator.generateShipName(options); }
export function generatePersonalName(options) { return nameGenerator.generatePersonalName(options); }
export function generateArtifactName(options) { return nameGenerator.generateArtifactName(options); }
export function generateDeityName(options) { return nameGenerator.generateDeityName(options); }
export function generateBattleName(options) { return nameGenerator.generateBattleName(options); }
export function generateGuildName(options) { return nameGenerator.generateGuildName(options); }