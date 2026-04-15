import Image from "next/image";

const IPA_URL =
  "https://github.com/a1cnore/vg-ipa-download/releases/download/4.14/superfriendlytinycorp.ipa";

export function DownloadWidget() {
  return (
    <a
      href={IPA_URL}
      className="flex items-center gap-3 rounded-lg border border-[#222] bg-[#0a0a0a]/80 backdrop-blur-sm px-3 py-2 hover:border-[#22d3ee] transition-colors shadow-lg"
      download
    >
      <Image
        src="/vainglory-ce-icon.png"
        alt="Vainglory CE"
        width={40}
        height={40}
        className="rounded-md"
      />
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-[#666]">
          Download
        </span>
        <span className="text-sm font-semibold text-[#e5e5e5]">
          Vainglory CE Unlocked EU
        </span>
      </div>
    </a>
  );
}
