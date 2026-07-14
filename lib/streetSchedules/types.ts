// Bulky-waste collection (גזם/גרוטאות/פסולת מוצקה), NOT regular household garbage —
// this is the domain the app is about: items left curbside for this pickup that others can salvage.
export interface RawStreetRow {
  street_name: string;
  collection_day: string;
  takeout_day: string;
  lat: number | null;
  lng: number | null;
}

export interface CityAdapter {
  city: string;
  fetchStreets(): Promise<RawStreetRow[]>;
}
