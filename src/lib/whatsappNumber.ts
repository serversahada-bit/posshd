// Nomor WhatsApp disimpan sebagai kode negara + nomor lokal tanpa "+" / nol depan,
// mis. "6281234567890" (Indonesia) atau "85291234567" (Hong Kong).

export type WaCountryInfo = {
  iso: string;
  name: string;
  dial: string;
  // Panjang nomor lokal yang pasti (tanpa nol depan). Hanya diisi untuk negara yang panjangnya
  // tetap, supaya nomor yang ditempel tanpa "+" (mis. "85291234567") aman dibuang kode negaranya.
  len?: number;
  // Kode negara dipakai bersama negara lain; bukan pilihan utama saat menebak dari "+kode".
  alt?: boolean;
};

// Ditampilkan paling atas di dropdown
const PINNED = ['ID', 'HK', 'MY', 'SG', 'TW', 'SA'];

const COUNTRIES: WaCountryInfo[] = [
  { iso: 'AF', name: 'Afganistan', dial: '93' },
  { iso: 'ZA', name: 'Afrika Selatan', dial: '27' },
  { iso: 'AL', name: 'Albania', dial: '355' },
  { iso: 'DZ', name: 'Aljazair', dial: '213' },
  { iso: 'US', name: 'Amerika Serikat', dial: '1', len: 10 },
  { iso: 'AD', name: 'Andorra', dial: '376' },
  { iso: 'AO', name: 'Angola', dial: '244' },
  { iso: 'AI', name: 'Anguilla', dial: '1264' },
  { iso: 'AG', name: 'Antigua dan Barbuda', dial: '1268' },
  { iso: 'SA', name: 'Arab Saudi', dial: '966', len: 9 },
  { iso: 'AR', name: 'Argentina', dial: '54' },
  { iso: 'AM', name: 'Armenia', dial: '374' },
  { iso: 'AW', name: 'Aruba', dial: '297' },
  { iso: 'AU', name: 'Australia', dial: '61', len: 9 },
  { iso: 'AT', name: 'Austria', dial: '43' },
  { iso: 'AZ', name: 'Azerbaijan', dial: '994' },
  { iso: 'BS', name: 'Bahama', dial: '1242' },
  { iso: 'BH', name: 'Bahrain', dial: '973', len: 8 },
  { iso: 'BD', name: 'Bangladesh', dial: '880', len: 10 },
  { iso: 'BB', name: 'Barbados', dial: '1246' },
  { iso: 'NL', name: 'Belanda', dial: '31' },
  { iso: 'BQ', name: 'Belanda Karibia', dial: '599', alt: true },
  { iso: 'BY', name: 'Belarus', dial: '375' },
  { iso: 'BE', name: 'Belgia', dial: '32' },
  { iso: 'BZ', name: 'Belize', dial: '501' },
  { iso: 'BJ', name: 'Benin', dial: '229' },
  { iso: 'BM', name: 'Bermuda', dial: '1441' },
  { iso: 'BT', name: 'Bhutan', dial: '975' },
  { iso: 'BO', name: 'Bolivia', dial: '591' },
  { iso: 'BA', name: 'Bosnia dan Herzegovina', dial: '387' },
  { iso: 'BW', name: 'Botswana', dial: '267' },
  { iso: 'BR', name: 'Brasil', dial: '55' },
  { iso: 'BN', name: 'Brunei Darussalam', dial: '673', len: 7 },
  { iso: 'BG', name: 'Bulgaria', dial: '359' },
  { iso: 'BF', name: 'Burkina Faso', dial: '226' },
  { iso: 'BI', name: 'Burundi', dial: '257' },
  { iso: 'CZ', name: 'Ceko', dial: '420' },
  { iso: 'TD', name: 'Chad', dial: '235' },
  { iso: 'CL', name: 'Chili', dial: '56' },
  { iso: 'CW', name: 'Curaçao', dial: '599' },
  { iso: 'DK', name: 'Denmark', dial: '45' },
  { iso: 'DJ', name: 'Djibouti', dial: '253' },
  { iso: 'DM', name: 'Dominika', dial: '1767' },
  { iso: 'EC', name: 'Ekuador', dial: '593' },
  { iso: 'SV', name: 'El Salvador', dial: '503' },
  { iso: 'ER', name: 'Eritrea', dial: '291' },
  { iso: 'EE', name: 'Estonia', dial: '372' },
  { iso: 'SZ', name: 'Eswatini', dial: '268' },
  { iso: 'ET', name: 'Etiopia', dial: '251' },
  { iso: 'FJ', name: 'Fiji', dial: '679' },
  { iso: 'PH', name: 'Filipina', dial: '63', len: 10 },
  { iso: 'FI', name: 'Finlandia', dial: '358' },
  { iso: 'GA', name: 'Gabon', dial: '241' },
  { iso: 'GM', name: 'Gambia', dial: '220' },
  { iso: 'GE', name: 'Georgia', dial: '995' },
  { iso: 'GH', name: 'Ghana', dial: '233' },
  { iso: 'GI', name: 'Gibraltar', dial: '350' },
  { iso: 'GD', name: 'Grenada', dial: '1473' },
  { iso: 'GL', name: 'Greenland', dial: '299' },
  { iso: 'GP', name: 'Guadeloupe', dial: '590' },
  { iso: 'GU', name: 'Guam', dial: '1671' },
  { iso: 'GT', name: 'Guatemala', dial: '502' },
  { iso: 'GN', name: 'Guinea', dial: '224' },
  { iso: 'GW', name: 'Guinea-Bissau', dial: '245' },
  { iso: 'GQ', name: 'Guinea Khatulistiwa', dial: '240' },
  { iso: 'GY', name: 'Guyana', dial: '592' },
  { iso: 'GF', name: 'Guyana Prancis', dial: '594' },
  { iso: 'HT', name: 'Haiti', dial: '509' },
  { iso: 'HN', name: 'Honduras', dial: '504' },
  { iso: 'HK', name: 'Hong Kong', dial: '852', len: 8 },
  { iso: 'HU', name: 'Hungaria', dial: '36' },
  { iso: 'IN', name: 'India', dial: '91', len: 10 },
  { iso: 'ID', name: 'Indonesia', dial: '62' },
  { iso: 'GB', name: 'Inggris (Britania Raya)', dial: '44', len: 10 },
  { iso: 'IQ', name: 'Irak', dial: '964' },
  { iso: 'IR', name: 'Iran', dial: '98' },
  { iso: 'IE', name: 'Irlandia', dial: '353' },
  { iso: 'IS', name: 'Islandia', dial: '354' },
  { iso: 'IL', name: 'Israel', dial: '972' },
  { iso: 'IT', name: 'Italia', dial: '39' },
  { iso: 'JM', name: 'Jamaika', dial: '1876' },
  { iso: 'JP', name: 'Jepang', dial: '81', len: 10 },
  { iso: 'DE', name: 'Jerman', dial: '49' },
  { iso: 'NC', name: 'Kaledonia Baru', dial: '687' },
  { iso: 'KH', name: 'Kamboja', dial: '855' },
  { iso: 'CM', name: 'Kamerun', dial: '237' },
  { iso: 'CA', name: 'Kanada', dial: '1', len: 10, alt: true },
  { iso: 'KZ', name: 'Kazakhstan', dial: '7', alt: true },
  { iso: 'KE', name: 'Kenya', dial: '254' },
  { iso: 'KY', name: 'Kepulauan Cayman', dial: '1345' },
  { iso: 'CK', name: 'Kepulauan Cook', dial: '682' },
  { iso: 'FK', name: 'Kepulauan Falkland', dial: '500' },
  { iso: 'FO', name: 'Kepulauan Faroe', dial: '298' },
  { iso: 'MP', name: 'Kepulauan Mariana Utara', dial: '1670' },
  { iso: 'MH', name: 'Kepulauan Marshall', dial: '692' },
  { iso: 'SB', name: 'Kepulauan Solomon', dial: '677' },
  { iso: 'TC', name: 'Kepulauan Turks dan Caicos', dial: '1649' },
  { iso: 'VI', name: 'Kepulauan Virgin Amerika Serikat', dial: '1340' },
  { iso: 'VG', name: 'Kepulauan Virgin Britania Raya', dial: '1284' },
  { iso: 'KG', name: 'Kirgizstan', dial: '996' },
  { iso: 'KI', name: 'Kiribati', dial: '686' },
  { iso: 'CO', name: 'Kolombia', dial: '57' },
  { iso: 'KM', name: 'Komoro', dial: '269' },
  { iso: 'CG', name: 'Kongo', dial: '242' },
  { iso: 'CD', name: 'Kongo (Republik Demokratik)', dial: '243' },
  { iso: 'KR', name: 'Korea Selatan', dial: '82' },
  { iso: 'KP', name: 'Korea Utara', dial: '850' },
  { iso: 'XK', name: 'Kosovo', dial: '383' },
  { iso: 'CR', name: 'Kosta Rika', dial: '506' },
  { iso: 'HR', name: 'Kroasia', dial: '385' },
  { iso: 'CU', name: 'Kuba', dial: '53' },
  { iso: 'KW', name: 'Kuwait', dial: '965', len: 8 },
  { iso: 'LA', name: 'Laos', dial: '856' },
  { iso: 'LV', name: 'Latvia', dial: '371' },
  { iso: 'LB', name: 'Lebanon', dial: '961' },
  { iso: 'LS', name: 'Lesotho', dial: '266' },
  { iso: 'LR', name: 'Liberia', dial: '231' },
  { iso: 'LY', name: 'Libya', dial: '218' },
  { iso: 'LI', name: 'Liechtenstein', dial: '423' },
  { iso: 'LT', name: 'Lituania', dial: '370' },
  { iso: 'LU', name: 'Luksemburg', dial: '352' },
  { iso: 'MG', name: 'Madagaskar', dial: '261' },
  { iso: 'MK', name: 'Makedonia Utara', dial: '389' },
  { iso: 'MO', name: 'Makau', dial: '853', len: 8 },
  { iso: 'MV', name: 'Maladewa', dial: '960' },
  { iso: 'MW', name: 'Malawi', dial: '265' },
  { iso: 'MY', name: 'Malaysia', dial: '60' },
  { iso: 'ML', name: 'Mali', dial: '223' },
  { iso: 'MT', name: 'Malta', dial: '356' },
  { iso: 'MA', name: 'Maroko', dial: '212' },
  { iso: 'MQ', name: 'Martinik', dial: '596' },
  { iso: 'MR', name: 'Mauritania', dial: '222' },
  { iso: 'MU', name: 'Mauritius', dial: '230' },
  { iso: 'YT', name: 'Mayotte', dial: '262', alt: true },
  { iso: 'MX', name: 'Meksiko', dial: '52' },
  { iso: 'EG', name: 'Mesir', dial: '20' },
  { iso: 'FM', name: 'Mikronesia', dial: '691' },
  { iso: 'MD', name: 'Moldova', dial: '373' },
  { iso: 'MC', name: 'Monako', dial: '377' },
  { iso: 'MN', name: 'Mongolia', dial: '976' },
  { iso: 'ME', name: 'Montenegro', dial: '382' },
  { iso: 'MS', name: 'Montserrat', dial: '1664' },
  { iso: 'MZ', name: 'Mozambik', dial: '258' },
  { iso: 'MM', name: 'Myanmar', dial: '95' },
  { iso: 'NA', name: 'Namibia', dial: '264' },
  { iso: 'NR', name: 'Nauru', dial: '674' },
  { iso: 'NP', name: 'Nepal', dial: '977' },
  { iso: 'NE', name: 'Niger', dial: '227' },
  { iso: 'NG', name: 'Nigeria', dial: '234' },
  { iso: 'NI', name: 'Nikaragua', dial: '505' },
  { iso: 'NU', name: 'Niue', dial: '683' },
  { iso: 'NO', name: 'Norwegia', dial: '47' },
  { iso: 'OM', name: 'Oman', dial: '968', len: 8 },
  { iso: 'PK', name: 'Pakistan', dial: '92', len: 10 },
  { iso: 'PW', name: 'Palau', dial: '680' },
  { iso: 'PS', name: 'Palestina', dial: '970' },
  { iso: 'PA', name: 'Panama', dial: '507' },
  { iso: 'CI', name: 'Pantai Gading', dial: '225' },
  { iso: 'PG', name: 'Papua Nugini', dial: '675' },
  { iso: 'PY', name: 'Paraguay', dial: '595' },
  { iso: 'PE', name: 'Peru', dial: '51' },
  { iso: 'PL', name: 'Polandia', dial: '48' },
  { iso: 'PF', name: 'Polinesia Prancis', dial: '689' },
  { iso: 'PT', name: 'Portugal', dial: '351' },
  { iso: 'FR', name: 'Prancis', dial: '33' },
  { iso: 'PR', name: 'Puerto Riko', dial: '1787' },
  { iso: 'QA', name: 'Qatar', dial: '974', len: 8 },
  { iso: 'CF', name: 'Republik Afrika Tengah', dial: '236' },
  { iso: 'DO', name: 'Republik Dominika', dial: '1809' },
  { iso: 'RE', name: 'Réunion', dial: '262' },
  { iso: 'RO', name: 'Rumania', dial: '40' },
  { iso: 'RU', name: 'Rusia', dial: '7' },
  { iso: 'RW', name: 'Rwanda', dial: '250' },
  { iso: 'KN', name: 'Saint Kitts dan Nevis', dial: '1869' },
  { iso: 'LC', name: 'Saint Lucia', dial: '1758' },
  { iso: 'PM', name: 'Saint Pierre dan Miquelon', dial: '508' },
  { iso: 'VC', name: 'Saint Vincent dan Grenadine', dial: '1784' },
  { iso: 'WS', name: 'Samoa', dial: '685' },
  { iso: 'AS', name: 'Samoa Amerika', dial: '1684' },
  { iso: 'SM', name: 'San Marino', dial: '378' },
  { iso: 'ST', name: 'Sao Tome dan Principe', dial: '239' },
  { iso: 'NZ', name: 'Selandia Baru', dial: '64' },
  { iso: 'SN', name: 'Senegal', dial: '221' },
  { iso: 'RS', name: 'Serbia', dial: '381' },
  { iso: 'SC', name: 'Seychelles', dial: '248' },
  { iso: 'SL', name: 'Sierra Leone', dial: '232' },
  { iso: 'SG', name: 'Singapura', dial: '65', len: 8 },
  { iso: 'SX', name: 'Sint Maarten', dial: '1721' },
  { iso: 'CY', name: 'Siprus', dial: '357' },
  { iso: 'SK', name: 'Slowakia', dial: '421' },
  { iso: 'SI', name: 'Slovenia', dial: '386' },
  { iso: 'SO', name: 'Somalia', dial: '252' },
  { iso: 'ES', name: 'Spanyol', dial: '34' },
  { iso: 'LK', name: 'Sri Lanka', dial: '94' },
  { iso: 'SD', name: 'Sudan', dial: '249' },
  { iso: 'SS', name: 'Sudan Selatan', dial: '211' },
  { iso: 'SY', name: 'Suriah', dial: '963' },
  { iso: 'SR', name: 'Suriname', dial: '597' },
  { iso: 'SE', name: 'Swedia', dial: '46' },
  { iso: 'CH', name: 'Swiss', dial: '41' },
  { iso: 'TW', name: 'Taiwan', dial: '886', len: 9 },
  { iso: 'TJ', name: 'Tajikistan', dial: '992' },
  { iso: 'CV', name: 'Tanjung Verde', dial: '238' },
  { iso: 'TZ', name: 'Tanzania', dial: '255' },
  { iso: 'TH', name: 'Thailand', dial: '66', len: 9 },
  { iso: 'TL', name: 'Timor Leste', dial: '670' },
  { iso: 'CN', name: 'Tiongkok', dial: '86', len: 11 },
  { iso: 'TG', name: 'Togo', dial: '228' },
  { iso: 'TK', name: 'Tokelau', dial: '690' },
  { iso: 'TO', name: 'Tonga', dial: '676' },
  { iso: 'TT', name: 'Trinidad dan Tobago', dial: '1868' },
  { iso: 'TN', name: 'Tunisia', dial: '216' },
  { iso: 'TR', name: 'Turki', dial: '90', len: 10 },
  { iso: 'TM', name: 'Turkmenistan', dial: '993' },
  { iso: 'TV', name: 'Tuvalu', dial: '688' },
  { iso: 'UG', name: 'Uganda', dial: '256' },
  { iso: 'UA', name: 'Ukraina', dial: '380' },
  { iso: 'AE', name: 'Uni Emirat Arab', dial: '971', len: 9 },
  { iso: 'UY', name: 'Uruguay', dial: '598' },
  { iso: 'UZ', name: 'Uzbekistan', dial: '998' },
  { iso: 'VU', name: 'Vanuatu', dial: '678' },
  { iso: 'VE', name: 'Venezuela', dial: '58' },
  { iso: 'VN', name: 'Vietnam', dial: '84', len: 9 },
  { iso: 'WF', name: 'Wallis dan Futuna', dial: '681' },
  { iso: 'YE', name: 'Yaman', dial: '967' },
  { iso: 'JO', name: 'Yordania', dial: '962' },
  { iso: 'GR', name: 'Yunani', dial: '30' },
  { iso: 'ZM', name: 'Zambia', dial: '260' },
  { iso: 'ZW', name: 'Zimbabwe', dial: '263' },
];

export const WA_COUNTRIES: WaCountryInfo[] = [
  ...PINNED.map((iso) => COUNTRIES.find((c) => c.iso === iso)!),
  ...COUNTRIES.filter((c) => !PINNED.includes(c.iso)),
];

export const DEFAULT_WA_COUNTRY = 'ID';

export const getWaCountry = (iso: string) =>
  COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES.find((c) => c.iso === DEFAULT_WA_COUNTRY)!;

// Bendera emoji dari kode ISO (di Windows tampil sebagai dua huruf, mis. "ID")
export const waFlag = (iso: string) =>
  String.fromCodePoint(...iso.split('').map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));

// Kode negara terpanjang yang cocok dengan awal nomor; utamakan negara yang sedang dipilih.
const BY_DIAL_LENGTH = [...COUNTRIES].filter((c) => !c.alt).sort((a, b) => b.dial.length - a.dial.length);
const matchDial = (digits: string, current: WaCountryInfo) =>
  digits.startsWith(current.dial) ? current : BY_DIAL_LENGTH.find((c) => digits.startsWith(c.dial));

// Pecah ketikan / tempelan nomor jadi negara + nomor lokal (tanpa kode negara & nol depan).
// Nomor yang ditempel lengkap dengan "+kode" / "00kode" otomatis memilih negaranya. "852..."
// tanpa "+" tidak ditebak sebagai HK karena bisa jadi nomor Telkomsel 0852 tanpa nol depan.
export const parseWaInput = (wa: string, iso: string) => {
  const raw = wa.trim();
  let country = getWaCountry(iso);
  let digits = raw.replace(/[^0-9]/g, '');

  const international = raw.startsWith('+') || raw.startsWith('00');
  const match = international ? matchDial(raw.startsWith('00') ? digits.substring(2) : digits, country) : undefined;
  if (match) {
    country = match;
    digits = (raw.startsWith('00') ? digits.substring(2) : digits).substring(match.dial.length);
  } else if (country.iso === 'ID' && digits.startsWith('62')) {
    // 62812... -> 812...
    digits = digits.substring(2);
  } else if (country.len && digits.startsWith(country.dial) && digits.length === country.dial.length + country.len) {
    digits = digits.substring(country.dial.length);
  }

  const local = digits.replace(/^0+/, '');
  return { country: country.iso, local, number: local ? country.dial + local : '' };
};
