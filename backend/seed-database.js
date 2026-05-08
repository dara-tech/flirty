import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "./src/model/user.model.js";
import Group from "./src/model/group.model.js";

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Company code derived from first digit of usercompanycodeuid
// "1xxx" → pic | "2xxx" → sre | "3xxx" → dev | "4xxx" → eval
// ─────────────────────────────────────────────────────────────────────────────
function getCompanyCode(usercompanycodeuid) {
  const prefix = String(usercompanycodeuid).charAt(0);
  const map = { 1: "pic", 2: "sre", 3: "dev", 4: "eval" };
  return map[prefix] || "pic";
}

// branchCode → lowercase folder name (e.g. "HO" → "ho", "KP1" → "kp1")
function getBranchFolder(branchCode) {
  return branchCode.toLowerCase().replace(/\s+/g, "_");
}

// ─────────────────────────────────────────────────────────────────────────────
// Real user accounts from system endpoint
// profilePic path: company_code/branch_code/image-upload/<loginUsercode>_profile.jpg
// ─────────────────────────────────────────────────────────────────────────────
const RAW_USERS = [
  {
    userName: "VAN RATHANA",
    loginUsercode: "4313029",
    branchCode: "Evaluator",
    usercompanycodeuid: "491",
  },
  {
    userName: "LY SRUNCHRIN",
    loginUsercode: "4313028",
    branchCode: "Evaluator",
    usercompanycodeuid: "490",
  },
  {
    userName: "ព្រឹក​ ច័ន្ទគ្រឹះស្នា",
    loginUsercode: "41124022",
    branchCode: "Evaluator",
    usercompanycodeuid: "47",
  },
  {
    userName: "ថាក់ បូណា",
    loginUsercode: "41124023",
    branchCode: "Evaluator",
    usercompanycodeuid: "46",
  },
  {
    userName: "ហ៊ីម​ សុងហៃ",
    loginUsercode: "41124019",
    branchCode: "Evaluator",
    usercompanycodeuid: "44",
  },
  {
    userName: "សាក់​ ឧត្ដម",
    loginUsercode: "41124020",
    branchCode: "Evaluator",
    usercompanycodeuid: "43",
  },
  {
    userName: "Kun VengAnn",
    loginUsercode: "400002",
    branchCode: "Evaluator",
    usercompanycodeuid: "42",
  },
  {
    userName: "PENH SOVATH",
    loginUsercode: "11124040",
    branchCode: "HO",
    usercompanycodeuid: "1158",
  },
  {
    userName: "Sot Lalin",
    loginUsercode: "11124039",
    branchCode: "KP1",
    usercompanycodeuid: "1157",
  },
  {
    userName: "York Monoran",
    loginUsercode: "111240338",
    branchCode: "HO",
    usercompanycodeuid: "1156",
  },
  {
    userName: "Yan Sengleang",
    loginUsercode: "1313026",
    branchCode: "HO",
    usercompanycodeuid: "1155",
  },
  {
    userName: "Phay Chanbopha",
    loginUsercode: "1PIC125",
    branchCode: "HO",
    usercompanycodeuid: "1151",
  },
  {
    userName: "Suy Kimyeng",
    loginUsercode: "1PIC601",
    branchCode: "KP1",
    usercompanycodeuid: "1150",
  },
  {
    userName: "Phal Sophanmai",
    loginUsercode: "1313023",
    branchCode: "HO",
    usercompanycodeuid: "1149",
  },
  {
    userName: "Mean Navy",
    loginUsercode: "1313022",
    branchCode: "HO",
    usercompanycodeuid: "1148",
  },
  {
    userName: "Um Ravy",
    loginUsercode: "1313025",
    branchCode: "HO",
    usercompanycodeuid: "1147",
  },
  {
    userName: "CHHENG SOKHADAVID",
    loginUsercode: "11124024",
    branchCode: "OP2",
    usercompanycodeuid: "1146",
  },
  {
    userName: "Tem Braendy",
    loginUsercode: "11124021",
    branchCode: "OP2",
    usercompanycodeuid: "1145",
  },
  {
    userName: "KEO SOKUNTHEA",
    loginUsercode: "1PICT033",
    branchCode: "HO",
    usercompanycodeuid: "1144",
  },
  {
    userName: "Vann Phanuk",
    loginUsercode: "11124018",
    branchCode: "KP1",
    usercompanycodeuid: "1143",
  },
  {
    userName: "Phang Vengxing",
    loginUsercode: "1558654",
    branchCode: "HO",
    usercompanycodeuid: "1142",
  },
  {
    userName: "Neang Muyhor",
    loginUsercode: "1558583",
    branchCode: "HO",
    usercompanycodeuid: "1141",
  },
  {
    userName: "Pen Sokpanha",
    loginUsercode: "11124017",
    branchCode: "KP1",
    usercompanycodeuid: "1140",
  },
  {
    userName: "LACH BORANN",
    loginUsercode: "1558161",
    branchCode: "HO",
    usercompanycodeuid: "1139",
  },
  {
    userName: "PHEA PHARIN",
    loginUsercode: "1558489",
    branchCode: "HO",
    usercompanycodeuid: "1137",
  },
  {
    userName: "SOB MALAI",
    loginUsercode: "1558507",
    branchCode: "HO",
    usercompanycodeuid: "1135",
  },
  {
    userName: "Nal Seakmeng",
    loginUsercode: "11124016",
    branchCode: "OP2",
    usercompanycodeuid: "1134",
  },
  {
    userName: "Yeng Saona",
    loginUsercode: "11124015",
    branchCode: "OP3",
    usercompanycodeuid: "1133",
  },
  {
    userName: "Song Thida",
    loginUsercode: "1558183",
    branchCode: "HO",
    usercompanycodeuid: "1132",
  },
  {
    userName: "Lay Prospov",
    loginUsercode: "1313020",
    branchCode: "KP1",
    usercompanycodeuid: "1128",
  },
  {
    userName: "Chem Solay",
    loginUsercode: "1558235",
    branchCode: "HO",
    usercompanycodeuid: "1124",
  },
  {
    userName: "Lay Fihong",
    loginUsercode: "11124013",
    branchCode: "OP3",
    usercompanycodeuid: "1123",
  },
  {
    userName: "Pey Seyha",
    loginUsercode: "11124012",
    branchCode: "OP3",
    usercompanycodeuid: "1122",
  },
  {
    userName: "Thol Sokneang",
    loginUsercode: "1722027",
    branchCode: "HO",
    usercompanycodeuid: "1121",
  },
  {
    userName: "Thoeun Panha",
    loginUsercode: "1KP1021",
    branchCode: "OP2",
    usercompanycodeuid: "1120",
  },
  {
    userName: "Phen Chanrothanak",
    loginUsercode: "1KP1018",
    branchCode: "OP2",
    usercompanycodeuid: "1119",
  },
  {
    userName: "Chhom Phearith",
    loginUsercode: "1KP1015",
    branchCode: "OP3",
    usercompanycodeuid: "1118",
  },
  {
    userName: "Teng Channy",
    loginUsercode: "1KP1012",
    branchCode: "HO",
    usercompanycodeuid: "1117",
  },
  {
    userName: "Hun Serey",
    loginUsercode: "1558305",
    branchCode: "HO",
    usercompanycodeuid: "1115",
  },
  {
    userName: "Phan Chanraksmey",
    loginUsercode: "1558009",
    branchCode: "HO",
    usercompanycodeuid: "1111",
  },
  {
    userName: "Mom Sothavath",
    loginUsercode: "1313016",
    branchCode: "KP1",
    usercompanycodeuid: "1110",
  },
  {
    userName: "Rong Narith",
    loginUsercode: "1558376",
    branchCode: "HO",
    usercompanycodeuid: "1106",
  },
  {
    userName: "Ou Samedy",
    loginUsercode: "1558187",
    branchCode: "HO",
    usercompanycodeuid: "1103",
  },
  {
    userName: "Khan Khim",
    loginUsercode: "1558334",
    branchCode: "HO",
    usercompanycodeuid: "1102",
  },
  {
    userName: "DOUT Mao",
    loginUsercode: "1PIC107",
    branchCode: "HO",
    usercompanycodeuid: "197",
  },
  {
    userName: "Hor Chariya",
    loginUsercode: "1PIC159",
    branchCode: "HO",
    usercompanycodeuid: "189",
  },
  {
    userName: "Suong Savong",
    loginUsercode: "1558584",
    branchCode: "OP2",
    usercompanycodeuid: "188",
  },
  {
    userName: "Norng Sreypov",
    loginUsercode: "1PIC624",
    branchCode: "HO",
    usercompanycodeuid: "187",
  },
  {
    userName: "Born Channy",
    loginUsercode: "1PIC629",
    branchCode: "HO",
    usercompanycodeuid: "186",
  },
  {
    userName: "San Sinat",
    loginUsercode: "1KP1007",
    branchCode: "HO",
    usercompanycodeuid: "183",
  },
  {
    userName: "Soeung Somny",
    loginUsercode: "1PIC340",
    branchCode: "HO",
    usercompanycodeuid: "157",
  },
  {
    userName: "Sovann Sreyneath",
    loginUsercode: "1PIC623",
    branchCode: "HO",
    usercompanycodeuid: "155",
  },
  {
    userName: "Ho Vanneth",
    loginUsercode: "1PIC587",
    branchCode: "OP2",
    usercompanycodeuid: "153",
  },
  {
    userName: "Sum Sovansathya",
    loginUsercode: "1558612",
    branchCode: "HO",
    usercompanycodeuid: "145",
  },
  {
    userName: "Yum Veasna",
    loginUsercode: "1PIC262",
    branchCode: "OP3",
    usercompanycodeuid: "141",
  },
  {
    userName: "Hun Bunlay",
    loginUsercode: "1PIC173",
    branchCode: "HO",
    usercompanycodeuid: "136",
  },
  {
    userName: "Souen Sreynich",
    loginUsercode: "1PIC586",
    branchCode: "HO",
    usercompanycodeuid: "134",
  },
  {
    userName: "Muth Sundy",
    loginUsercode: "1PIC176",
    branchCode: "OP2",
    usercompanycodeuid: "133",
  },
  {
    userName: "Taing Hong",
    loginUsercode: "1tainghong",
    branchCode: "HO",
    usercompanycodeuid: "131",
  },
  {
    userName: "Tem Pheaktra",
    loginUsercode: "1PIC461",
    branchCode: "HO",
    usercompanycodeuid: "129",
  },
  {
    userName: "Rin Chenda",
    loginUsercode: "1PIC339",
    branchCode: "HO",
    usercompanycodeuid: "125",
  },
  {
    userName: "Taing Meyhour",
    loginUsercode: "1PIC449",
    branchCode: "HO",
    usercompanycodeuid: "124",
  },
  {
    userName: "Son Sreyrath",
    loginUsercode: "1PIC369",
    branchCode: "HO",
    usercompanycodeuid: "122",
  },
  {
    userName: "Chea Daroth",
    loginUsercode: "1PIC186",
    branchCode: "HO",
    usercompanycodeuid: "121",
  },
  {
    userName: "Khin Senglang",
    loginUsercode: "1558201",
    branchCode: "HO",
    usercompanycodeuid: "114",
  },
  {
    userName: "SanSiNat",
    loginUsercode: "2SRE007",
    branchCode: "HO",
    usercompanycodeuid: "212",
  },
  {
    userName: "Phom MengChou",
    loginUsercode: "1558120",
    branchCode: "HO",
    usercompanycodeuid: "112",
  },
  {
    userName: "Proum Channimol",
    loginUsercode: "1558011",
    branchCode: "HO",
    usercompanycodeuid: "111",
  },
  {
    userName: "Lach Rany",
    loginUsercode: "1558010",
    branchCode: "HO",
    usercompanycodeuid: "110",
  },
  {
    userName: "Kem Chanthath",
    loginUsercode: "1558077",
    branchCode: "HO",
    usercompanycodeuid: "17",
  },
  {
    userName: "Bun Zhicheav",
    loginUsercode: "1PIC801",
    branchCode: "HO",
    usercompanycodeuid: "15",
  },
  {
    userName: "Taing Ngoun",
    loginUsercode: "1PIC800",
    branchCode: "HO",
    usercompanycodeuid: "14",
  },
  {
    userName: "Hem Loeurt",
    loginUsercode: "1558499",
    branchCode: "HO",
    usercompanycodeuid: "13",
  },
  {
    userName: "Sim Panha",
    loginUsercode: "1PICX010",
    branchCode: "OP3",
    usercompanycodeuid: "162",
  },
  // SRE company (prefix "2")
  {
    userName: "Van Rathana",
    loginUsercode: "2313029",
    branchCode: "HO",
    usercompanycodeuid: "238",
  },
  {
    userName: "Ly Srunchrin",
    loginUsercode: "2313028",
    branchCode: "HO",
    usercompanycodeuid: "237",
  },
  {
    userName: "Taing Heang",
    loginUsercode: "2SRE003",
    branchCode: "HO",
    usercompanycodeuid: "28",
  },
  // DEV / Evaluator company (prefix "3")
  {
    userName: "ចាន់​​ សុខធា",
    loginUsercode: "300003",
    branchCode: "Evaluator",
    usercompanycodeuid: "350",
  },
  {
    userName: "ដុត ហាល់",
    loginUsercode: "300002",
    branchCode: "Evaluator",
    usercompanycodeuid: "349",
  },
  {
    userName: "រស់ កក្កដា",
    loginUsercode: "300001",
    branchCode: "Evaluator",
    usercompanycodeuid: "348",
  },
  // EVAL company (prefix "4")
  {
    userName: "Phea Saray",
    loginUsercode: "4558655",
    branchCode: "Evaluator",
    usercompanycodeuid: "489",
  },
  {
    userName: "Chheom Cheathavong",
    loginUsercode: "42410004",
    branchCode: "Evaluator",
    usercompanycodeuid: "488",
  },
  {
    userName: "Chea Samdy",
    loginUsercode: "42410003",
    branchCode: "Evaluator",
    usercompanycodeuid: "487",
  },
  {
    userName: "Yea Sarout",
    loginUsercode: "42410002",
    branchCode: "Evaluator",
    usercompanycodeuid: "486",
  },
  {
    userName: "San Sampheavathana",
    loginUsercode: "4HO185",
    branchCode: "Evaluator",
    usercompanycodeuid: "485",
  },
  {
    userName: "Kun Sopheak",
    loginUsercode: "4558219",
    branchCode: "Evaluator",
    usercompanycodeuid: "484",
  },
  {
    userName: "Bean Sereiroth",
    loginUsercode: "4313011",
    branchCode: "Evaluator",
    usercompanycodeuid: "482",
  },
  {
    userName: "Pheng Hin",
    loginUsercode: "4HO360",
    branchCode: "Evaluator",
    usercompanycodeuid: "477",
  },
  {
    userName: "Khom Somnang",
    loginUsercode: "4314024",
    branchCode: "Evaluator",
    usercompanycodeuid: "476",
  },
  {
    userName: "Buth Chenla",
    loginUsercode: "41124011",
    branchCode: "Evaluator",
    usercompanycodeuid: "475",
  },
  {
    userName: "Som Pheaktra",
    loginUsercode: "41124010",
    branchCode: "Evaluator",
    usercompanycodeuid: "474",
  },
  {
    userName: "Yan Sinen",
    loginUsercode: "4558565",
    branchCode: "Evaluator",
    usercompanycodeuid: "472",
  },
  {
    userName: "Sek Chun",
    loginUsercode: "4558230",
    branchCode: "Evaluator",
    usercompanycodeuid: "471",
  },
  {
    userName: "Tep Bunny",
    loginUsercode: "4558615",
    branchCode: "Evaluator",
    usercompanycodeuid: "470",
  },
  {
    userName: "Cheng Seanghak",
    loginUsercode: "4558560",
    branchCode: "Evaluator",
    usercompanycodeuid: "469",
  },
  {
    userName: "Mong Sophara",
    loginUsercode: "4558193",
    branchCode: "Evaluator",
    usercompanycodeuid: "468",
  },
  {
    userName: "Sok Lekhena",
    loginUsercode: "4558088",
    branchCode: "Evaluator",
    usercompanycodeuid: "467",
  },
  {
    userName: "Ty Vanthan",
    loginUsercode: "4558278",
    branchCode: "Evaluator",
    usercompanycodeuid: "466",
  },
  {
    userName: "Som Orn",
    loginUsercode: "4558228",
    branchCode: "Evaluator",
    usercompanycodeuid: "465",
  },
  {
    userName: "Pov Savan",
    loginUsercode: "4558024",
    branchCode: "Evaluator",
    usercompanycodeuid: "464",
  },
  {
    userName: "Chhour Ratana",
    loginUsercode: "4558638",
    branchCode: "Evaluator",
    usercompanycodeuid: "463",
  },
  {
    userName: "Sien Bonheng",
    loginUsercode: "4558626",
    branchCode: "Evaluator",
    usercompanycodeuid: "462",
  },
  {
    userName: "York Monorum",
    loginUsercode: "4558619",
    branchCode: "Evaluator",
    usercompanycodeuid: "461",
  },
  {
    userName: "Ly Thearim",
    loginUsercode: "4558464",
    branchCode: "Evaluator",
    usercompanycodeuid: "460",
  },
  {
    userName: "Nan Sreythea",
    loginUsercode: "4558192",
    branchCode: "Evaluator",
    usercompanycodeuid: "458",
  },
  {
    userName: "Lok Vannak",
    loginUsercode: "4558014",
    branchCode: "Evaluator",
    usercompanycodeuid: "457",
  },
  {
    userName: "pet kiman",
    loginUsercode: "4558467",
    branchCode: "Evaluator",
    usercompanycodeuid: "456",
  },
  {
    userName: "Pen sina",
    loginUsercode: "4558526",
    branchCode: "Evaluator",
    usercompanycodeuid: "455",
  },
  {
    userName: "Choem Rorn",
    loginUsercode: "4313010",
    branchCode: "Evaluator",
    usercompanycodeuid: "454",
  },
  {
    userName: "Seang Kakada",
    loginUsercode: "4558150",
    branchCode: "Evaluator",
    usercompanycodeuid: "453",
  },
  {
    userName: "Sot Vichet",
    loginUsercode: "4558087",
    branchCode: "Evaluator",
    usercompanycodeuid: "452",
  },
  {
    userName: "KONG VUTHY",
    loginUsercode: "1PIC593",
    branchCode: "OP3",
    usercompanycodeuid: "149",
  },
  {
    userName: "Yim Kanann",
    loginUsercode: "4558653",
    branchCode: "Evaluator",
    usercompanycodeuid: "445",
  },
  {
    userName: "Pha Vin",
    loginUsercode: "4558651",
    branchCode: "Evaluator",
    usercompanycodeuid: "442",
  },
  {
    userName: "Phat Vuthy",
    loginUsercode: "4PSC114",
    branchCode: "Evaluator",
    usercompanycodeuid: "440",
  },
  {
    userName: "Seng Hong",
    loginUsercode: "4558648",
    branchCode: "Evaluator",
    usercompanycodeuid: "439",
  },
  {
    userName: "San Sokheng",
    loginUsercode: "4558621",
    branchCode: "Evaluator",
    usercompanycodeuid: "436",
  },
  {
    userName: "Leng Loemheng",
    loginUsercode: "4558579",
    branchCode: "Evaluator",
    usercompanycodeuid: "435",
  },
  {
    userName: "Horn Nich",
    loginUsercode: "4558570",
    branchCode: "Evaluator",
    usercompanycodeuid: "434",
  },
  {
    userName: "Nhan Ravy",
    loginUsercode: "4CKM540",
    branchCode: "Evaluator",
    usercompanycodeuid: "432",
  },
  {
    userName: "Nov Setha",
    loginUsercode: "4558541",
    branchCode: "Evaluator",
    usercompanycodeuid: "431",
  },
  {
    userName: "Lang Ritisak",
    loginUsercode: "4SNG123",
    branchCode: "Evaluator",
    usercompanycodeuid: "425",
  },
  {
    userName: "Tin Kila",
    loginUsercode: "4HO100",
    branchCode: "Evaluator",
    usercompanycodeuid: "417",
  },
  {
    userName: "Vy Pisith",
    loginUsercode: "4558407",
    branchCode: "Evaluator",
    usercompanycodeuid: "416",
  },
  {
    userName: "SEM Sopheak",
    loginUsercode: "4BTB296",
    branchCode: "Evaluator",
    usercompanycodeuid: "415",
  },
  {
    userName: "Ban Demong",
    loginUsercode: "4558317",
    branchCode: "Evaluator",
    usercompanycodeuid: "413",
  },
  {
    userName: "Meng Sochea",
    loginUsercode: "4558281",
    branchCode: "Evaluator",
    usercompanycodeuid: "412",
  },
  {
    userName: "Seng Sokcheap",
    loginUsercode: "4558163",
    branchCode: "Evaluator",
    usercompanycodeuid: "411",
  },
  {
    userName: "Chhy Sarum",
    loginUsercode: "4PSC095",
    branchCode: "Evaluator",
    usercompanycodeuid: "410",
  },
  {
    userName: "Rou Vannak",
    loginUsercode: "4PSC261",
    branchCode: "Evaluator",
    usercompanycodeuid: "49",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Real groups: branch-based + department-based
// Members are resolved by loginUsercode after user insertion
// ─────────────────────────────────────────────────────────────────────────────
const GROUP_DEFINITIONS = [
  {
    name: "Head Office - PIC",
    description: "PIC company Head Office staff group",
    matchFn: (u) =>
      getCompanyCode(u.usercompanycodeuid) === "pic" && u.branchCode === "HO",
  },
  {
    name: "Koh Pich 1 Branch",
    description: "Koh Pich 1 branch credit officers and staff",
    matchFn: (u) => u.branchCode === "KP1",
  },
  {
    name: "Operation Team 2 (OP2)",
    description: "Operation Team 2 field staff",
    matchFn: (u) => u.branchCode === "OP2",
  },
  {
    name: "Operation Team 3 (OP3)",
    description: "Operation Team 3 field staff",
    matchFn: (u) => u.branchCode === "OP3",
  },
  {
    name: "Evaluator Team",
    description: "All evaluator staff across companies",
    matchFn: (u) => u.branchCode === "Evaluator",
  },
  {
    name: "SRE Head Office",
    description: "SRE company Head Office team",
    matchFn: (u) => getCompanyCode(u.usercompanycodeuid) === "sre",
  },
  {
    name: "All Staff",
    description: "Company-wide all staff group",
    matchFn: () => true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// DB Connection
// ─────────────────────────────────────────────────────────────────────────────
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create real users
// email    : loginUsercode@gmail.com (lowercased)
// fullname : userName
// profilePic: company_code/branch_code/image-upload/<loginUsercode>_profile.jpg
// ─────────────────────────────────────────────────────────────────────────────
async function createUsers() {
  console.log(`\n📝 Creating ${RAW_USERS.length} real users...`);

  const hashedPassword = await bcrypt.hash("Tsd123!@#", 10);

  // De-duplicate by loginUsercode to prevent duplicate email errors
  const seen = new Set();
  const users = [];

  for (const u of RAW_USERS) {
    const code = u.loginUsercode.toLowerCase();
    if (seen.has(code)) {
      console.log(
        `   ⚠️  Skipping duplicate loginUsercode: ${u.loginUsercode}`,
      );
      continue;
    }
    seen.add(code);

    const companyCode = getCompanyCode(u.usercompanycodeuid);
    const branchFolder = getBranchFolder(u.branchCode);

    users.push({
      email: `${code}@gmail.com`,
      fullname: u.userName,
      password: hashedPassword,
      profilePic: `${companyCode}/${branchFolder}/image-upload/${u.loginUsercode}_profile.jpg`,
    });
  }

  console.log(`   Total unique users to insert: ${users.length}`);

  try {
    const result = await User.insertMany(users, { ordered: false });
    console.log(`✅ Inserted ${result.length} users`);
    return await User.find({});
  } catch (error) {
    if (error.code === 11000) {
      console.log(`⚠️  Some users already exist — fetching all from DB...`);
      return await User.find({});
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create groups based on GROUP_DEFINITIONS
// Admin  : first matched member
// Members: all matched users (excluding admin)
// ─────────────────────────────────────────────────────────────────────────────
async function createGroups(insertedUsers) {
  console.log(`\n📝 Creating ${GROUP_DEFINITIONS.length} groups...`);

  if (insertedUsers.length === 0) {
    throw new Error("No users available to create groups");
  }

  // Build a lookup: loginUsercode (lower) → MongoDB _id
  const userByCode = new Map();
  for (const dbUser of insertedUsers) {
    // email is loginUsercode@gmail.com, so strip @gmail.com
    const code = dbUser.email.replace("@gmail.com", "");
    userByCode.set(code, dbUser._id);
  }

  const groups = [];

  for (const def of GROUP_DEFINITIONS) {
    // Filter RAW_USERS that match this group's condition
    const matchedRaw = RAW_USERS.filter((u) => def.matchFn(u));

    // Resolve to MongoDB _ids (skip if user not found)
    const matchedIds = [];
    for (const u of matchedRaw) {
      const id = userByCode.get(u.loginUsercode.toLowerCase());
      if (id) matchedIds.push(id);
    }

    if (matchedIds.length === 0) {
      console.log(`   ⚠️  "${def.name}" — no matching users, skipping`);
      continue;
    }

    const [adminId, ...memberIds] = matchedIds;

    groups.push({
      name: def.name,
      description: def.description,
      groupPic: "", // update with real group photo path when available
      admin: adminId,
      admins: [],
      members: memberIds, // excludes admin (Telegram-style)
      settings: { onlyAdminsCanPost: false },
    });

    console.log(`   ✔ "${def.name}" — admin + ${memberIds.length} members`);
  }

  try {
    const result = await Group.insertMany(groups, { ordered: false });
    console.log(`✅ Inserted ${result.length} groups`);
    return result;
  } catch (error) {
    if (error.code === 11000) {
      console.log(`⚠️  Some groups already exist — fetching all from DB...`);
      return await Group.find({});
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function seedDatabase() {
  try {
    console.log("🌱 Starting database seeding with REAL accounts...");
    console.log(
      `📊 Target: ${RAW_USERS.length} users + ${GROUP_DEFINITIONS.length} groups`,
    );
    console.log("🔐 Password for all users: Tsd123!@#");
    console.log("=".repeat(60));

    await connectDB();

    const users = await createUsers();
    console.log(`✅ Total users in database: ${users.length}`);

    const groups = await createGroups(users);
    console.log(`✅ Total groups in database: ${groups.length}`);

    console.log("\n" + "=".repeat(60));
    console.log("🎉 Database seeding completed successfully!");
    console.log("=".repeat(60));
    console.log("\n📋 Summary:");
    console.log(`   👥 Users  : ${users.length}`);
    console.log(`   🏢 Groups : ${groups.length}`);
    console.log(`   🔑 Password: Tsd123!@#`);
    console.log("\n💡 Sample login emails:");
    for (let i = 0; i < Math.min(8, users.length); i++) {
      console.log(`   - ${users[i].email}`);
    }
  } catch (error) {
    console.error("\n❌ Seeding failed:", error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log("\n👋 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run
seedDatabase();
