import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  //TODO: replace with url
  const imageUrl = `https://example.com/images/${id}`;

  //For testing on localhost
  const imagesFolder = path.join(process.cwd(), "public", "images");
  const imagePath = path.join(imagesFolder, id);
  console.log(imagePath);
  try {
    // const response = await fetch(imageUrl);
    // if (!response.ok) {
    //   return NextResponse.json(
    //     { error: "Failed to fetch image" },
    //     { status: response.status },
    //   );
    // }
    // const imageBuffer = await response.arrayBuffer();
    // return new Response(imageBuffer, {
    //   headers: {
    //     "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
    //     "Content-Disposition": `inline; filename="${id}"`,
    //   },
    // });

    //For testing on localhost
    const imageBuffer = await fs.readFile(imagePath);
    return new Response(imageBuffer, {
      headers: {
        "Content-Type": "image/jpeg", // Adjust this if your images are not JPEG
        "Content-Disposition": `inline; filename="${id}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "An error occurred while fetching the image" },
      { status: 500 },
    );
  }
}
