/* Tracks you can download from the music settings.
 *
 * Nothing here ships with Zeno: each entry points to the artist's own page or
 * to a public archive, and the TV downloads the file from there when you ask.
 * Every track can be shared freely: CC0 (public domain) or CC BY 4.0, which
 * asks for credit to the author. The credit is shown next to each track and
 * listed in docs/credits.md.
 *
 * Shared by the app (window.ZenoMusicCatalog) and the network service
 * (require), which downloads only the files listed here.
 */
(function (root) {
  'use strict';

  var BUCKLEY = 'https://www.scottbuckley.com.au/library/';
  var BUCKLEY_FILES = BUCKLEY + 'wp-content/uploads/';
  var CYLINDERS = 'https://archive.org/download/Cylinders-15736/Chris_Zabriskie_-_';
  var ROSEVERE = 'https://archive.org/download/leerosevere_musicforpodcasts_6/';
  var FREESOUND = 'https://freesound.org/s/';
  var PREVIEWS = 'https://cdn.freesound.org/previews/';

  function buckley(id, title, file, seconds, bytes, page) {
    return {
      id: 'sb-' + id,
      kind: 'music',
      title: title,
      artist: 'Scott Buckley',
      license: 'CC BY 4.0',
      page: BUCKLEY + (page || id) + '/',
      file: BUCKLEY_FILES + file,
      seconds: seconds,
      bytes: bytes
    };
  }

  function cylinder(n, name, seconds, bytes) {
    return {
      id: 'cz-cylinder-' + name.toLowerCase(),
      kind: 'music',
      title: 'Cylinder ' + name,
      artist: 'Chris Zabriskie',
      album: 'Cylinders',
      license: 'CC BY 4.0',
      page: 'https://chriszabriskie.com/cylinders/',
      file: CYLINDERS + '0' + n + '_-_Cylinder_' + name + '.mp3',
      seconds: seconds,
      bytes: bytes
    };
  }

  function rosevere(id, title, file, seconds, bytes) {
    return {
      id: 'lr-' + id,
      kind: 'music',
      title: title,
      artist: 'Lee Rosevere',
      album: 'Music For Podcasts 6',
      license: 'CC BY 4.0',
      page: 'https://archive.org/details/leerosevere_musicforpodcasts_6',
      file: ROSEVERE + encodeURIComponent('Lee Rosevere - Music For Podcasts 6 - ' + file + '.mp3'),
      seconds: seconds,
      bytes: bytes
    };
  }

  /* A Freesound recording, downloaded as its public high-quality preview. */
  function recording(id, sound, author, title, place, original, seconds, bytes) {
    return {
      id: 'fs-' + sound.split('_')[0],
      kind: 'nature',
      title: title,
      place: place,
      artist: author,
      original: original,
      license: 'CC0',
      page: FREESOUND + sound.split('_')[0] + '/',
      file: PREVIEWS + sound.slice(0, 3) + '/' + sound + '-hq.mp3',
      seconds: seconds,
      bytes: bytes,
      group: id
    };
  }

  var CATALOG = [
    buckley('in-this-moment', 'In This Moment', '2026/08/InThisMoment.mp3', 200, 7984316),
    buckley('penumbra', 'Penumbra', '2025/07/Penumbra.mp3', 450, 17994415),
    buckley('meanwhile', 'Meanwhile', '2025/01/Meanwhile.mp3', 326, 13036146),
    buckley('cirrus', 'Cirrus', '2023/03/Cirrus.mp3', 418, 16739494),
    buckley('permafrost', 'Permafrost', '2022/08/Permafrost.mp3', 448, 17939045),
    buckley('moonlight', 'Moonlight', '2022/07/Moonlight.mp3', 254, 10177523),
    buckley('cicadas', 'Cicadas', '2023/12/Cicadas.mp3', 393, 15732208),
    buckley('shadows-and-dust', 'Shadows and Dust', '2023/11/ShadowsAndDust.mp3', 408, 16339308),
    buckley('echoes', 'Echoes', '2024/05/Echoes.mp3', 364, 14557747),
    buckley('memories-of-stone', 'Memories of Stone', '2026/02/MemoriesOfStone.mp3', 330, 13217159),
    buckley('hymn-to-the-dawn', 'Hymn to the Dawn', '2022/11/HymnToTheDawn.mp3', 418, 16737414),
    buckley('first-snow', 'First Snow', '2022/12/FirstSnow.mp3', 213, 8538080),
    buckley(
      'in-search-of-solitude',
      'In Search of Solitude',
      '2022/05/sb_insearchofsolitude.mp3',
      445,
      17812595
    ),
    buckley('unraveling', 'Unraveling', '2026/05/Unraveling.mp3', 444, 17764541),
    cylinder(2, 'Two', 228, 9328680),
    cylinder(5, 'Five', 174, 7157383),
    cylinder(7, 'Seven', 532, 21502787),
    cylinder(8, 'Eight', 339, 13770542),
    cylinder(9, 'Nine', 323, 13128974),
    rosevere('cloudloop', 'Cloudloop', '06 Cloudloop', 300, 12094619),
    rosevere('heavn', 'HEAVN', '08 HEAVN', 271, 10934782),
    {
      id: 'hz-meditation-1',
      kind: 'music',
      title: '20 Minute Meditation 1',
      artist: 'HoliznaCC0',
      license: 'CC0',
      page: 'https://archive.org/details/holizna-cc-0-20-minute-meditation-1',
      file:
        'https://archive.org/download/holizna-cc-0-20-minute-meditation-1/' +
        encodeURIComponent('HoliznaCC0 - 20 Minute Meditation 1.mp3'),
      seconds: 1280,
      bytes: 51199885
    },
    {
      id: 'hz-dreamscape',
      kind: 'music',
      title: 'DreamScape',
      artist: 'HoliznaCC0',
      license: 'CC0',
      page: 'https://archive.org/details/holizna-cc-0-cosmic-waves',
      file:
        'https://archive.org/download/holizna-cc-0-cosmic-waves/' +
        encodeURIComponent('HoliznaCC0 - DreamScape.mp3'),
      seconds: 1320,
      bytes: 52800205
    },

    recording(
      'night',
      '868984_1661766',
      'Félix Blume',
      'Notte quieta',
      'Guyana francese',
      'Quiet night in French Guiana (1 hour)',
      3601,
      84462480
    ),
    recording(
      'night',
      '868987_1661766',
      'Félix Blume',
      'Rane e grilli nella notte',
      'Sentiero Rorota, Guyana francese',
      'Night Frogs and Crickets - Rorota Trail, French Guiana',
      361,
      8244000
    ),
    recording(
      'rain',
      '868995_1661766',
      'Félix Blume',
      'Pioggia leggera e rane di notte',
      'Rémire-Montjoly, Guyana francese',
      'Light Rain, Frogs and Toads at Night - Rémire-Montjoly, French Guiana',
      517,
      12206928
    ),
    recording(
      'rain',
      '673287_1661766',
      'Félix Blume',
      'Arriva la pioggia nella foresta',
      'Accampamento di notte',
      'Rain in forest arrives and gets louder in a camp at night',
      284,
      6576240
    ),
    recording(
      'rain',
      '536679_1661766',
      'Félix Blume',
      'Temporale notturno',
      'Veracruz, Messico',
      'Thunder & Rain in Veracruz during the night (1 hour)',
      3600,
      83762496
    ),
    recording(
      'rain',
      '648475_2968542',
      'rifualk',
      'Temporale nella foresta',
      '',
      'Forest Rainstorm 02',
      719,
      16853376
    ),
    recording(
      'rain',
      '736847_11519060',
      'bruno.auzet',
      'Pioggia leggera sulla yurta',
      '',
      'soft rain yurt',
      253,
      5837280
    ),
    recording(
      'rain',
      '533154_1038806',
      'unfa',
      'Pioggia forte dietro la finestra',
      '',
      'Heavy Rain Behind A Window',
      323,
      7554480
    ),
    recording(
      'sea',
      '868990_1661766',
      'Félix Blume',
      'Onde e vento di notte',
      'Rémire-Montjoly, Guyana francese',
      'Waves and Strong Wind at Night - Rémire-Montjoly, French Guiana',
      608,
      13733136
    ),
    recording(
      'sea',
      '868988_1661766',
      'Félix Blume',
      'Mare lontano nella foresta',
      'Sentiero Rorota, Guyana francese',
      'Distant Waves in the forest - Rorota Trail, French Guiana',
      288,
      6671040
    ),
    recording(
      'sea',
      '530186_1661766',
      'Félix Blume',
      'Onde sugli scogli',
      'Dinard, Bretagna',
      'Wave on the rocks in Dinard (Britain, France)',
      178,
      4512576
    ),
    recording(
      'sea',
      '417797_3285887',
      'esh9419',
      'Onde leggere',
      '',
      'Gentle Ocean Waves Mix (2018)',
      720,
      16457952
    ),
    recording(
      'sea',
      '362414_589889',
      'be-steele',
      'Risacca sulla costa',
      'Maine, Stati Uniti',
      'Ocean Surf Along the Coast of Maine',
      439,
      9960048
    ),
    recording(
      'forest',
      '579834_9763271',
      'AntonioZozobra',
      'Uccelli all’alba',
      '',
      'Birds at dawn',
      1025,
      23211124
    ),
    recording(
      'forest',
      '121964_78482',
      'nfsgit',
      'Bosco silenzioso',
      'Nord-Odal, Norvegia',
      'quiet forest birds insects leaf rustle',
      319,
      7402704
    ),
    recording(
      'forest',
      '636548_14042309',
      'L.Finck',
      'Uccelli nel bosco',
      'Registrazione binaurale',
      'Forest-birds-binaural',
      283,
      6491952
    ),
    recording(
      'forest',
      '776081_10924423',
      'soundandmelodies',
      'Bosco di notte',
      'Otepää, Estonia',
      'Night, Quiet Forest - Otepää, Estonia',
      253,
      5700960
    ),
    recording(
      'water',
      '578068_7241289',
      'BurghRecords',
      'Ruscello nel bosco',
      '',
      'Calm Stream In Forest',
      467,
      12298080
    ),
    recording(
      'water',
      '556841_12184473',
      'klau78',
      'Piccolo torrente',
      '',
      'Small river water stream',
      322,
      7119984
    )
  ];

  if (typeof module === 'object' && module.exports) module.exports = CATALOG;
  else root.ZenoMusicCatalog = CATALOG;
})(this);
