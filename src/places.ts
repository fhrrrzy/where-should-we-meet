export type Place = { name: string; lat: number; lng: number };
export const places: Place[] = [
  { name: "Grogol", lat: -6.1616, lng: 106.7904 },
  { name: "Cempaka Putih Barat", lat: -6.1803, lng: 106.8658 },
  { name: "Gandaria City", lat: -6.2441, lng: 106.7834 },
  { name: "Cawang", lat: -6.2439, lng: 106.8683 },
  { name: "Sudirman", lat: -6.2088, lng: 106.8218 },
  { name: "Grand Indonesia", lat: -6.1952, lng: 106.8205 },
  { name: "Bundaran HI", lat: -6.1931, lng: 106.823 },
  { name: "Dukuh Atas", lat: -6.2004, lng: 106.8233 },
  { name: "Setiabudi", lat: -6.214, lng: 106.825 },
  { name: "Menteng", lat: -6.1959, lng: 106.8376 },
  { name: "Monas", lat: -6.1754, lng: 106.8272 },
  { name: "Gambir", lat: -6.1767, lng: 106.8305 },
  { name: "Cikini", lat: -6.1987, lng: 106.8462 },
  { name: "Tanah Abang", lat: -6.1857, lng: 106.8109 },
  { name: "Senayan", lat: -6.2253, lng: 106.802 },
  { name: "Gelora Bung Karno", lat: -6.2186, lng: 106.8025 },
  { name: "SCBD", lat: -6.225, lng: 106.808 },
  { name: "Blok M", lat: -6.2444, lng: 106.7984 },
  { name: "Kemang", lat: -6.2615, lng: 106.8154 },
  { name: "Kuningan", lat: -6.2284, lng: 106.8333 },
  { name: "Tebet", lat: -6.2282, lng: 106.8585 },
  { name: "Pancoran", lat: -6.243, lng: 106.8425 },
  { name: "Pasar Minggu", lat: -6.2844, lng: 106.844 },
  { name: "Ragunan", lat: -6.312, lng: 106.819 },
  { name: "Pondok Indah", lat: -6.2652, lng: 106.7846 },
  { name: "Lebak Bulus", lat: -6.2893, lng: 106.7749 },
  { name: "Fatmawati", lat: -6.2924, lng: 106.7927 },
  { name: "Cilandak", lat: -6.289, lng: 106.802 },
  { name: "Duren Sawit", lat: -6.2344, lng: 106.9194 },
  { name: "Rawamangun", lat: -6.1965, lng: 106.8856 },
  { name: "Kelapa Gading", lat: -6.1588, lng: 106.905 },
  { name: "Sunter", lat: -6.1436, lng: 106.8681 },
  { name: "Ancol", lat: -6.1256, lng: 106.8337 },
  { name: "Kota Tua", lat: -6.1352, lng: 106.8133 },
  { name: "Pluit", lat: -6.1212, lng: 106.792 },
  { name: "Tanjung Duren", lat: -6.1774, lng: 106.7864 },
  { name: "Central Park", lat: -6.1775, lng: 106.7904 },
  { name: "Kebon Jeruk", lat: -6.195, lng: 106.767 },
  { name: "Puri Indah", lat: -6.1876, lng: 106.7373 },
  { name: "Slipi", lat: -6.2024, lng: 106.7991 },
  { name: "Palmerah", lat: -6.207, lng: 106.795 },
  { name: "Manggarai", lat: -6.2099, lng: 106.8502 },
  { name: "Cilincing", lat: -6.1138, lng: 106.9445 },
  { name: "Cakung", lat: -6.1855, lng: 106.9415 },
  { name: "Jagakarsa", lat: -6.3349, lng: 106.8233 },
  { name: "Kalideres", lat: -6.1392, lng: 106.705 },
  { name: "Cengkareng", lat: -6.1487, lng: 106.735 },
  { name: "Kembangan", lat: -6.1907, lng: 106.7383 },
  { name: "Penjaringan", lat: -6.128, lng: 106.799 },
  { name: "Marunda", lat: -6.113, lng: 106.963 },
  { name: "Cipayung", lat: -6.329, lng: 106.902 },
  { name: "Ciracas", lat: -6.329, lng: 106.872 },
];
export const colors = [
  "#f35aa6",
  "#ff8e88",
  "#739aff",
  "#58e1bb",
  "#e7bc62",
  "#ba91ff",
];
export type Friend = { id: number; name: string; place: Place; color?: number };
export const friendLabel = (f: Friend) => f.name.trim() || `Friend ${f.id + 1}`;
export const friendColorIndex = (f: Friend) => f.color ?? f.id % colors.length;
export const friendColor = (f: Friend) => colors[friendColorIndex(f)];
export const friendInitial = (f: Friend) =>
  /^Friend \d+$/.test(friendLabel(f))
    ? friendLabel(f).slice(7)
    : Array.from(friendLabel(f))[0].toUpperCase();
export const initialFriends = (): Friend[] =>
  ["Budi", "Putri", "Dimas", "Sari"].map((name, id) => ({
    id,
    name,
    place: places[id],
  }));
