export const members = [
  { id: 1, name: "Paul Acuña", role: "Vocalista", email: "paul@caf.org", phone: "+1 555 123 4567", instrument: "Voz" },
  { id: 2, name: "Ana Colina", role: "Pianista", email: "ana.colina@caf.org", phone: "+1 555 234 5678", instrument: "Piano" },
  { id: 3, name: "Olga Romero", role: "Guitarrista", email: "olga.romero@caf.org", phone: "+1 555 345 6789", instrument: "Guitarra Eléctrica" },
  { id: 4, name: "Gustavo Godoy", role: "Baterista", email: "gustavo.godoy@caf.org", phone: "+1 555 456 7890", instrument: "Batería" },
  { id: 5, name: "Daniel Córdoba", role: "Bajista", email: "daniel.cordoba@caf.org", phone: "+1 555 567 8901", instrument: "Bajo" },
  { id: 6, name: "María Elena Pérez", role: "Tecladista", email: "maria.perez@caf.org", phone: "+1 555 678 9012", instrument: "Teclado" },
  { id: 7, name: "Roberto Silva", role: "Guitarrista", email: "roberto.silva@caf.org", phone: "+1 555 789 0123", instrument: "Guitarra Acústica" },
  { id: 8, name: "Carmen Torres", role: "Coros", email: "carmen.torres@caf.org", phone: "+1 555 890 1234", instrument: "Voz" },
];

export const bands = [
  { id: 1, name: "Banda Principal", members: [1, 2, 3, 4, 5] },
  { id: 2, name: "Banda Jóvenes", members: [3, 6, 7, 8] },
  { id: 3, name: "Banda Acústica", members: [1, 2, 7, 8] },
];

export const songs = [
  { id: 1, title: "Océanos", artist: "Hillsong United", key: "D", lastUsed: "2025-03-15" },
  { id: 2, title: "Hermoso Nombre", artist: "Hillsong", key: "G", lastUsed: "2025-03-15" },
  { id: 3, title: "Cuerdas de Amor", artist: "Julio Melgar", key: "C", lastUsed: "2025-02-20" },
  { id: 4, title: "Way Maker", artist: "Sinach", key: "A", lastUsed: "2025-03-15" },
  { id: 5, title: "Rey de Reyes", artist: "Hillsong", key: "E", lastUsed: "2025-01-10" },
  { id: 6, title: "Grande y Fuerte", artist: "Marcela Bubola", key: "A", lastUsed: "2024-12-20" },
  { id: 7, title: "Santo es el Señor", artist: "Alberto Lenord", key: "G", lastUsed: null },
  { id: 8, title: "Ven Espírito Santo", artist: "Alvaro Lopez", key: "D", lastUsed: null },
  { id: 9, title: "Te Exaltamos", artist: "Generación 12", key: "B", lastUsed: "2025-03-01" },
  { id: 10, title: "Dulce Jesús Mío", artist: "Manny Gaitán", key: "Am", lastUsed: "2024-11-15" },
];

export const orders = [
  { id: 1, date: "2025-03-23", bandId: 1, songs: [1, 2, 4, 9] },
  { id: 2, date: "2025-03-30", bandId: 2, songs: [3, 6, 8] },
  { id: 3, date: "2025-04-06", bandId: 1, songs: [2, 5, 1, 4] },
  { id: 4, date: "2025-04-13", bandId: 3, songs: [7, 8, 10, 3] },
];
