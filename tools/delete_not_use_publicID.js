const readline = require("readline");
require("dotenv").config();
const cloudinary = require("cloudinary").v2;

if (typeof process.env.CLOUDINARY_URL === "undefined") {
  console.warn(
    "Check you've got a .env file in the root of the project with the CLOUDINARY_URL environment variable for your Cloudinary product environment."
  );
}
// Return "https" URLs by setting secure: true
cloudinary.config({
  secure: true,
});

//*firebase上目前有使用的照片
const firebaseUsed = require("./in_use_publicID.json");
console.log("firebase目前使用的照片", firebaseUsed);

// 取得雲端所有上傳過的圖片
function getAllUploadImages() {
  return cloudinary.search.expression("resource_type:image").execute();
}

// 找到未使用的照片
findNotUsedImages();
async function findNotUsedImages() {
  const result = await getAllUploadImages();
  const resources = result.resources;
  const notUsedInFirebase = resources
    //雲端所有上傳過的照片
    .map((user) => user.public_id)
    .filter((cloudPublicIds) => !firebaseUsed.includes(cloudPublicIds));
  if (notUsedInFirebase.length === 0) {
    return console.log("沒有可刪除的資料");
  }
  console.log("將刪除以下未使用於 Firebase 的圖片", notUsedInFirebase);
  confirmAndDeleteImages(notUsedInFirebase);
}

// 刪除照片
function confirmAndDeleteImages(notUsedInFirebase) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("輸入 y 確認刪除，其他鍵取消: ", async (answer) => {
    if (answer === "y") {
      try {
        await cloudinary.api.delete_resources(notUsedInFirebase);
        console.log("刪除成功");
      } catch (error) {
        console.log(" 刪除失敗，原因：", error.message);
      }
    } else {
      console.log("已取消刪除。");
    }
    rl.close();
  });
}
