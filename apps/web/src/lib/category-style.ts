import {
  Apple,
  BedDouble,
  Brain,
  Camera,
  Coffee,
  Dog,
  Droplets,
  Dumbbell,
  Flower2,
  GraduationCap,
  Hand,
  PartyPopper,
  PawPrint,
  PenTool,
  Scissors,
  Smile,
  Sparkles,
  Stethoscope,
  Store,
  Trophy,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Her kategorinin görsel kimliği: simge + kapak renk geçişi.
// Gerçek fotoğraf yüklenene kadar kartlar ve kapaklar bununla görünür.
export interface CategoryStyle {
  icon: LucideIcon;
  from: string;
  to: string;
}

const STYLES: Record<string, CategoryStyle> = {
  kuafor: { icon: Scissors, from: "#f472b6", to: "#be185d" },
  berber: { icon: Scissors, from: "#64748b", to: "#1e293b" },
  guzellik: { icon: Sparkles, from: "#c084fc", to: "#7e22ce" },
  tirnak: { icon: Hand, from: "#fb7185", to: "#e11d48" },
  "masaj-spa": { icon: Flower2, from: "#5eead4", to: "#0f766e" },
  restoran: { icon: UtensilsCrossed, from: "#fb923c", to: "#c2410c" },
  kafe: { icon: Coffee, from: "#d6a77a", to: "#78350f" },
  "dis-hekimi": { icon: Smile, from: "#67e8f9", to: "#0e7490" },
  klinik: { icon: Stethoscope, from: "#60a5fa", to: "#1d4ed8" },
  psikolog: { icon: Brain, from: "#a5b4fc", to: "#4338ca" },
  diyetisyen: { icon: Apple, from: "#a3e635", to: "#4d7c0f" },
  veteriner: { icon: PawPrint, from: "#fcd34d", to: "#b45309" },
  "pet-kuafor": { icon: Dog, from: "#fdba74", to: "#c2410c" },
  spor: { icon: Dumbbell, from: "#f87171", to: "#991b1b" },
  saha: { icon: Trophy, from: "#4ade80", to: "#15803d" },
  "oto-yikama": { icon: Droplets, from: "#38bdf8", to: "#0369a1" },
  "oto-servis": { icon: Wrench, from: "#94a3b8", to: "#334155" },
  dovme: { icon: PenTool, from: "#71717a", to: "#18181b" },
  fotograf: { icon: Camera, from: "#fda4af", to: "#9f1239" },
  egitim: { icon: GraduationCap, from: "#818cf8", to: "#3730a3" },
  konaklama: { icon: BedDouble, from: "#2dd4bf", to: "#115e59" },
  etkinlik: { icon: PartyPopper, from: "#f0abfc", to: "#a21caf" },
  diger: { icon: Store, from: "#a8a29e", to: "#44403c" },
};

export function categoryStyle(slug: string | null | undefined): CategoryStyle {
  return (slug && STYLES[slug]) || STYLES.diger;
}

export function gradient(slug: string | null | undefined, angle = 135): string {
  const s = categoryStyle(slug);
  return `linear-gradient(${angle}deg, ${s.from}, ${s.to})`;
}
