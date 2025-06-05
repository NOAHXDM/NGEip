const readline = require("readline");
require("dotenv").config();
const cloudinary = require("cloudinary").v2;

if (typeof process.env.CLOUDINARY_URL === "undefined") {
  console.warn(
    "Check you've got a .env file in the root of the project with the CLOUDINARY_URL environment variable for your Cloudinary product environment."
  );
}

//*firebase上目前有使用的
const firebaseUsed = require("./in_use_publicID.json");
console.log(firebaseUsed);

// Return "https" URLs by setting secure: true
cloudinary.config({
  secure: true,
});

home();

//抓到所有圖片URL
async function home() {
  const result = await cloudinary.search
    .expression("resource_type:image")
    .execute();

  //* 所有上傳過的PublicIds;
  const cloudPublicIds = result.resources.map((user) => user.public_id);
  console.log("雲端全部ID", cloudPublicIds);

  const unusedOnFirebase = cloudPublicIds.filter((cloudPublicIds) => {
    return !firebaseUsed.includes(cloudPublicIds);
  });

  if (unusedOnFirebase.length === 0) {
    console.log("沒有可刪除的資源。");
    return;
  }

  console.log("以下是未使用於 Firebase 的圖片，是否要刪除？", unusedOnFirebase);

  // 建立 readline 介面
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("輸入 y 確認刪除，其他鍵取消: ", (answer) => {
    if (answer === "y") {
      cloudinary.api.delete_resources(unusedOnFirebase);
      console.log("刪除成功");
    } else {
      console.log("已取消刪除。");
    }
  });
}
