import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { trackAICrawlerRequest } from "@datafast/ai-crawl";

// DataFast bot traffic (datafa.st/docs/bot-traffic-tracking): report search and AI crawler page requests server-side, since
// crawlers skip the JS tracker. The package ignores humans, assets and framework internals; never awaited (fire and forget).
export function proxy(request: NextRequest, event: NextFetchEvent) {
  trackAICrawlerRequest(request, event, { websiteId: "dfid_6j6yTA2sZi0HT5AyhSiqi" });
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
