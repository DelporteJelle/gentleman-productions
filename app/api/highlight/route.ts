import { NextResponse } from "next/server";
import mockdata from '@/mockdata/highlight.json';

export async function GET(request: Request) {
  return NextResponse.json(mockdata);
}
