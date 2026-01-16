/**
 * MAP CONSTANTS - Color palettes and elevation settings
 */

// Elevation color gradient (green = low/sea level, red = high mountains)
// Index 0 = sea level (0m), Index 255 = max height (6000m)
export const LAND_COLORS = [
    "#006837","#016a38","#026c39","#036e3a","#04703b","#05713c","#06733d","#07753e",
    "#08773f","#0a7940","#0b7b41","#0c7d42","#0d7e43","#0e8044","#108245","#118446",
    "#128646","#148747","#158948","#178b49","#188d4a","#1a8f4b","#1c904c","#1e924d",
    "#1f944e","#21954f","#23974f","#259950","#289a51","#2a9c52","#2c9d53","#2e9f54",
    "#31a154","#33a255","#36a456","#38a557","#3ba757","#3da858","#40aa59","#43ab5a",
    "#46ad5a","#48ae5b","#4baf5c","#4eb15c","#51b25d","#53b45e","#56b55e","#59b65f",
    "#5cb85f","#5eb960","#61ba60","#64bc61","#67bd62","#69be62","#6cbf62","#6fc063",
    "#71c263","#74c364","#77c464","#79c565","#7cc665","#7fc866","#81c966","#84ca66",
    "#86cb67","#89cc67","#8bcd68","#8ece68","#90cf69","#92d069","#95d16a","#97d26b",
    "#99d36b","#9cd56c","#9ed66c","#a0d76d","#a3d86e","#a5d86f","#a7d970","#a9da70",
    "#acdb71","#aedc72","#b0dd73","#b2de74","#b4df75","#b6e076","#b8e178","#bae279",
    "#bce37a","#bee47b","#c0e47c","#c2e57e","#c4e67f","#c6e780","#c8e882","#cae983",
    "#cce985","#ceea86","#d0eb88","#d2ec89","#d3ec8b","#d5ed8d","#d7ee8e","#d9ef90",
    "#daef92","#dcf093","#def195","#dff297","#e1f298","#e2f39a","#e4f39c","#e6f49d",
    "#e7f59f","#e8f5a1","#eaf6a2","#ebf6a4","#edf6a5","#eef7a6","#eff7a8","#f0f7a9",
    "#f1f8aa","#f3f8ab","#f4f8ab","#f5f8ac","#f6f8ad","#f7f8ad","#f7f8ad","#f8f7ae",
    "#f9f7ae","#faf7ad","#faf6ad","#fbf6ad","#fbf5ac","#fcf5ab","#fcf4ab","#fcf3aa",
    "#fdf2a9","#fdf1a7","#fdf0a6","#fdefa5","#feeea3","#feeda2","#feeca0","#feeb9f",
    "#feea9d","#fee89b","#fee79a","#fee698","#fee496","#fee394","#fee192","#fee090",
    "#fede8f","#fedd8d","#fedb8b","#feda89","#fed887","#fed685","#fed584","#fed382",
    "#fed180","#fecf7e","#fecd7d","#fecc7b","#fdca79","#fdc878","#fdc676","#fdc474",
    "#fdc273","#fdc071","#fdbe70","#fdbc6e","#fdba6d","#fdb86b","#fcb56a","#fcb368",
    "#fcb167","#fcaf65","#fcad64","#fcaa62","#fba861","#fba660","#fba35e","#fba15d",
    "#fa9f5b","#fa9c5a","#fa9a59","#f99858","#f99556","#f99355","#f88e53",
    "#f88b51","#f78950","#f7864f","#f6844e","#f6824d","#f57f4b","#f57d4a","#f47a49",
    "#f37848","#f37547","#f27346","#f17044","#f16e43","#f06b42","#ef6941","#ee6640",
    "#ed643f","#ed613e","#ec5f3d","#eb5d3c","#ea5a3a","#e95839","#e85538","#e75337",
    "#e55136","#e44e35","#e34c34","#e24a33","#e14733","#e04532","#de4331","#dd4030",
    "#dc3e2f","#da3c2e","#d93a2e","#d7382d","#d6352c","#d4332c","#d3312b","#d12f2b",
    "#d02d2a","#ce2b2a","#cc2929","#cb2729","#c92529","#c72328","#c52128","#c41f28",
    "#c21d28","#c01b27","#be1927","#bc1727","#ba1527","#b81327","#b61127","#b50f26",
    "#b30d26","#b10b26","#af0926","#ad0826","#ab0626","#a90426","#a70226","#a50026"
];

// Ocean colors: light blue (shallow/0m) to dark blue (deep/-4000m)
// Index 0 = sea level (0m), Index 60 = max depth (-4000m)
export const OCEAN_COLORS = [
    "#5ea3cc","#5ba1cb","#599fca","#569dc9","#549bc8","#5199c7","#4f98c6","#4d96c5",
    "#4b94c4","#4892c3","#4690c2","#448ec1","#428cc0","#408bbf","#3e89be","#3d87bd",
    "#3b85bc","#3983bb","#3781ba","#3680b9","#347eb7","#337cb6","#317ab5","#3078b4",
    "#2e76b2","#2d75b1","#2c73b0","#2a71ae","#296fad","#286dab","#266baa","#2569a8",
    "#2467a6","#2365a4","#2164a2","#2062a0","#1f609e","#1e5e9c","#1d5c9a","#1b5a98",
    "#1a5895","#195693","#185490","#17528e","#164f8b","#154d89","#134b86","#124983",
    "#114781","#10457e","#0f437b","#0e4178","#0d3f75","#0c3d73","#0a3b70","#09386d",
    "#08366a","#073467","#063264","#053061"
];

// Precipitation colors: red (dry/0) to blue (wet/1)
// 64-value gradient
export const PRECIP_COLORS = [
    "#67001f","#73021f","#7e041f","#8a061f","#95081f","#a00b1f","#ab0d20","#b51020",
    "#be1321","#c61621","#ce1a22","#d51e23","#dc2224","#e22726","#e72c28","#ec322a",
    "#f0382d","#f33f30","#f64633","#f84d37","#fa553b","#fb5d3f","#fc6544","#fd6d49",
    "#fd764f","#fe7f55","#fe875b","#fe9062","#fe9969","#fea170","#feaa78","#feb280",
    "#febb88","#fec390","#fecb99","#fed2a1","#fedaaa","#fee1b3","#fee8bc","#feeec5",
    "#fef4ce","#fef9d8","#fefde1","#f9fee9","#f2fef0","#eafdf6","#e1fcfb","#d7faff",
    "#cdf7ff","#c2f4ff","#b6f0ff","#aaecff","#9de8ff","#90e3ff","#82deff","#74d9ff",
    "#66d3ff","#58cdff","#4ac6ff","#3cbfff","#2fb8fe","#23b0fc","#18a8fa","#0e9ff7"
];

// Political map kingdom colors - antique/aged map style
// Muted, earthy tones reminiscent of historical cartography
export const POLITICAL_COLORS = [
    "rgba(230, 218, 188, 0.5)", // Aged parchment
    "rgba(212, 196, 160, 0.5)", // Old vellum
    "rgba(201, 203, 171, 0.5)", // Faded olive
    "rgba(218, 204, 180, 0.5)", // Weathered tan
    "rgba(196, 189, 168, 0.5)", // Dusty khaki
    "rgba(216, 208, 184, 0.5)", // Antique cream
    "rgba(203, 191, 164, 0.5)", // Worn leather
    "rgba(208, 202, 174, 0.5)", // Pale umber
    "rgba(200, 196, 166, 0.5)", // Sage parchment
    "rgba(221, 212, 188, 0.5)", // Ivory
    "rgba(198, 188, 162, 0.5)", // Chamois
    "rgba(212, 204, 176, 0.5)", // Old paper
    "rgba(204, 202, 170, 0.5)", // Faded moss
    "rgba(217, 210, 186, 0.5)", // Bleached linen
    "rgba(194, 186, 160, 0.5)", // Driftwood
    "rgba(214, 206, 173, 0.5)", // Bone
    "rgba(200, 194, 164, 0.5)", // Lichen
    "rgba(220, 214, 190, 0.5)", // Pale straw
    "rgba(196, 190, 170, 0.5)", // Stone
    "rgba(210, 200, 172, 0.5)", // Sand
    "rgba(202, 198, 168, 0.5)", // Dried herb
    "rgba(216, 210, 182, 0.5)", // Wheat
    "rgba(192, 188, 164, 0.5)", // Pewter
    "rgba(212, 206, 178, 0.5)", // Oatmeal
    "rgba(198, 194, 166, 0.5)", // Sage gray
    "rgba(218, 212, 184, 0.5)", // Ecru
    "rgba(194, 190, 162, 0.5)", // Clay
    "rgba(208, 204, 176, 0.5)", // Mushroom
    "rgba(200, 196, 170, 0.5)", // Ash
    "rgba(220, 216, 188, 0.5)", // Canvas
    // Additional colors for more variety
    "rgba(225, 210, 175, 0.5)", // Golden parchment
    "rgba(190, 200, 175, 0.5)", // Sage green
    "rgba(205, 195, 180, 0.5)", // Warm gray
    "rgba(215, 200, 165, 0.5)", // Honey
    "rgba(185, 195, 170, 0.5)", // Moss
    "rgba(210, 205, 190, 0.5)", // Pearl
    "rgba(195, 185, 165, 0.5)", // Taupe
    "rgba(220, 205, 175, 0.5)", // Cream
    "rgba(188, 198, 178, 0.5)", // Celadon
    "rgba(208, 198, 168, 0.5)"  // Buff
];

// Ocean color for political map - aged parchment blue-gray
export const POLITICAL_OCEAN = "#C4CBBE";

// Border color for kingdoms - aged sepia ink
export const POLITICAL_BORDER = "#6B5344";

// Elevation constants (in meters)
export const ELEVATION = {
    MAX: 6000,      // Highest mountain peaks
    MIN: -4000,     // Deepest ocean trenches
    SEA_LEVEL: 0,   // Sea level
    RANGE: 10000    // Total range (6000 - (-4000))
};
