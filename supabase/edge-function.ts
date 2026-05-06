import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

async function getContext(sb: any) {
  try {
    const { data } = await sb.rpc("get_context");
    return data;
  } catch {
    return null;
  }
}

function respond(data: unknown, ctx: unknown, status = 200) {
  const body = ctx != null ? { data, _context: ctx } : data;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errJson(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const ctx = await getContext(supabase);
  const url = new URL(req.url);
  const path = url.pathname.replace("/crosstalk-api", "");

  try {
    if (req.method === "GET" && path === "/search") {
      const q = url.searchParams.get("q") || "";
      if (!q) return errJson("Missing q", 400);
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=3`
      );
      const itunesData = await itunesRes.json();
      const results = (itunesData.results || []).map((r: any) => ({
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName,
        cover: r.artworkUrl100?.replace("100x100", "600x600") || "",
        link: r.trackViewUrl || "",
        previewUrl: r.previewUrl || "",
      }));
      return respond(results, ctx);
    }

    if (req.method === "GET" && path === "/pairs") {
      const { data, error } = await supabase
        .from("crosstalk_pairs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return respond(data, ctx);
    }

    if (req.method === "GET" && path === "/comments") {
      const { data, error } = await supabase
        .from("crosstalk_comments")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return respond(data, ctx);
    }

    if (req.method === "GET" && path === "/settings") {
      const { data, error } = await supabase
        .from("crosstalk_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return respond(data, ctx);
    }

    if (req.method === "POST" && path === "/pairs") {
      const body = await req.json();
      const { data, error } = await supabase
        .from("crosstalk_pairs")
        .insert(body)
        .select()
        .single();
      if (error) throw error;
      return respond(data, ctx);
    }

    if (req.method === "PATCH" && path.startsWith("/pairs/")) {
      const id = path.split("/")[2];
      const body = await req.json();
      const { data, error } = await supabase
        .from("crosstalk_pairs")
        .update(body)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return respond(data, ctx);
    }

    if (req.method === "POST" && path === "/comments") {
      const body = await req.json();
      const { data, error } = await supabase
        .from("crosstalk_comments")
        .insert(body)
        .select()
        .single();
      if (error) throw error;
      return respond(data, ctx);
    }

    if (req.method === "PATCH" && path === "/settings") {
      const body = await req.json();
      const { data, error } = await supabase
        .from("crosstalk_settings")
        .update(body)
        .eq("id", 1)
        .select()
        .single();
      if (error) throw error;
      return respond(data, ctx);
    }

    return errJson("Not found", 404);
  } catch (e) {
    return errJson(e.message);
  }
});
