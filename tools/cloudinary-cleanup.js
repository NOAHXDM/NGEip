const readline = require("readline");
const fs = require("fs");
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

const imageIDs = getImagesPublicIDbyEIP();
main(imageIDs);

function getImagesPublicIDbyEIP() {
  if (!fs.existsSync("tools/eipImages.json")) {
    return [];
  }

  const result = require("./eipImages.json");
  return result;
}

async function main(imageIDs) {
  if (imageIDs.length == 0) {
    console.log("Image ids is empty, not need to do anything.");
    return;
  }

  const result = await getAllImagesInCloudinary();
  const resources = result.resources;
  const imagesNeedRemove = resources
    .map((user) => user.public_id)
    .filter((cloudPublicIds) => !imageIDs.includes(cloudPublicIds));

  if (imagesNeedRemove.length === 0) {
    return console.log("No image to remove");
  }

  removeImages(imagesNeedRemove);
}

function getAllImagesInCloudinary() {
  return cloudinary.search.expression("resource_type:image").execute();
}

function removeImages(imagesNeedRemove) {
  console.log("Unused images: ", imagesNeedRemove);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Remove all images(Y/n)", async (answer) => {
    if (answer.toLowerCase() === "y") {
      try {
        await cloudinary.api.delete_resources(imagesNeedRemove);
        console.log("Delete successfully");
      } catch (error) {
        console.log("Delete failure, cause: ", error.message);
      }
    } else {
      console.log("Cancel");
    }
    rl.close();
  });
}
