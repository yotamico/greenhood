const TLV_LIST_DS = {
  ListId: "199ef16a-f4ae-455c-86ba-e605b9d2d4f1",
  SiteId: "24aa409e-01ed-482e-b0ed-1956972addb1",
  WebId:  "d14581a0-c790-4272-9c8d-7a1f3956c176",
  ViewId: "36e06a6c-84a8-4b21-b9e4-b6d907944f03",
  Fields: null, ItemdIds: null, ListContentTypes: null,
};

function fixDays(raw: string): string {
  if (!raw) return "";
  if (raw === ";#א;#ב;#ג;#ד;#ה;#ו;#") return "א–ו";
  const clean = raw.replace(/;#/g, " ").trim();
  return clean;
}

function fieldVal(fields: { Caption: string; Value: string }[], name: string): string {
  return fields.find(f => f.InternalName === name)?.Value ?? "";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const street = searchParams.get("street");
  if (!street) return Response.json({ error: "missing street" }, { status: 400 });

  // Step 1: autocomplete → streetID
  const autoRes = await fetch(
    `https://www.tel-aviv.gov.il/_layouts/15/infrastructure/handlers/StreetDetails.ashx?k=streets&street=${encodeURIComponent(street)}`,
    { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": "eco-navigation/1.0" }, body: "{}" }
  );
  if (!autoRes.ok) return Response.json({ error: "autocomplete failed" }, { status: 502 });
  const streets: { captionField: string; idField: number }[] = await autoRes.json();
  if (!streets.length) return Response.json({ error: "street not found" }, { status: 404 });
  const streetID = streets[0].idField;
  const streetName = streets[0].captionField;

  // Step 2: GetGezem → collection days
  const gezemRes = await fetch(
    "https://www.tel-aviv.gov.il/_vti_bin/TlvSP2013PublicSite/TlvListUtils.svc/GetGezem",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
        "User-Agent": "eco-navigation/1.0",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://www.tel-aviv.gov.il/Residents/Environment/Pages/StreetsCleaning.aspx",
      },
      body: JSON.stringify({
        streetID,
        ListDS: TLV_LIST_DS,
        numOfItems: 50,
        pageUrl: "/Residents/Environment/Pages/StreetsCleaning.aspx",
        LobbyId: "",
      }),
    }
  );
  if (!gezemRes.ok) return Response.json({ error: "gezem failed" }, { status: 502 });
  const items: { Fields: { Caption: string; InternalName: string; Value: string }[] }[] = await gezemRes.json();
  if (!items.length) return Response.json({ streetID, streetName, items: [] });

  const result = items.map(item => ({
    streetName:   fieldVal(item.Fields, "streetName"),
    from:         fieldVal(item.Fields, "fromNumer"),
    to:           fieldVal(item.Fields, "ToNumber"),
    details:      fieldVal(item.Fields, "Details"),
    trimmingDays: fixDays(fieldVal(item.Fields, "TrimmingClear")),
    binDays:      fixDays(fieldVal(item.Fields, "BinClear")),
    streetClean:  fixDays(fieldVal(item.Fields, "StreetClean")),
    station:      fieldVal(item.Fields, "CleaningStation"),
  }));

  return Response.json({ streetID, streetName, items: result });
}
