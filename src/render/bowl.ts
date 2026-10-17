import { BROTHS, type BrothId } from '../data/broths.ts';
/** Original vector illustration, deliberately not presented as a restaurant photograph. */
export function bowlArt(id: BrothId): string {
  const color = BROTHS[id].color;
  return `<svg class="bowl-art" viewBox="0 0 320 230" fill="none" aria-hidden="true">
    <ellipse cx="158" cy="205" rx="108" ry="12" fill="#262b24" opacity=".09"/>
    <path d="M48 111c5 66 47 94 112 94s107-28 112-94" fill="#e8e4d9" stroke="#292e28" stroke-width="2"/>
    <path d="M69 144c23 33 57 46 91 46s68-13 91-46M83 163c22 19 47 27 77 27s55-8 77-27" stroke="#b7b7a7" stroke-width="1.5"/>
    <ellipse cx="160" cy="110" rx="112" ry="57" fill="#faf7ed" stroke="#292e28" stroke-width="2"/>
    <ellipse cx="160" cy="111" rx="101" ry="46" fill="${color}"/>
    <g stroke="#f8e0a5" stroke-width="4" stroke-linecap="round">
      <path d="M102 107c11-17 56-22 68-5s-40 11-38 25 44 6 51-5M105 121c-4 17 50 25 77 13M119 95c20-9 58-4 63 7M101 134c19 12 41 15 63 12"/>
    </g>
    <path d="m185 83 32-21 23 34-33 18Z" fill="#344c39"/>
    <path d="m190 87 27-18m-21 26 26-18m-20 26 25-17" stroke="#637658"/>
    <ellipse cx="104" cy="103" rx="25" ry="16" transform="rotate(-24 104 103)" fill="#f6f0d9" stroke="#d4c4a6"/>
    <ellipse cx="105" cy="103" rx="12" ry="10" transform="rotate(-24 105 103)" fill="#e7a037"/>
    <ellipse cx="210" cy="128" rx="25" ry="16" transform="rotate(-12 210 128)" fill="#b78365"/>
    <path d="M192 127c6-14 34-12 36 0s-24 17-27 7 14-14 18-7" stroke="#eac2a1" stroke-width="3"/>
    <g fill="#51734a"><ellipse cx="146" cy="86" rx="7" ry="3"/><ellipse cx="160" cy="83" rx="7" ry="3"/><ellipse cx="171" cy="91" rx="7" ry="3"/><ellipse cx="154" cy="94" rx="7" ry="3"/></g>
    <g stroke="#745442" stroke-width="4" stroke-linecap="round"><path d="m183 72 108-52"/><path d="m193 79 101-47"/></g>
    <g stroke="#a9aca1" stroke-width="1.5" stroke-linecap="round"><path d="M132 49c-10-12 9-20 0-32M155 43c-10-12 9-20 0-32M178 49c-10-12 9-20 0-32"/></g>
  </svg>`;
}
