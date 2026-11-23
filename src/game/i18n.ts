import type { LanguageCode } from './types';

export interface Translations {
  subtitle: string;
  playGame: string;
  continueGame: string;
  newGame: string;
  levelSelect: string;
  settings: string;
  howToPlay: string;
  credits: string;
  resume: string;
  restartLevel: string;
  mainMenu: string;
  nextLevel: string;
  replay: string;
  paused: string;
  levelComplete: string;
  crystals: string;
  time: string;
  bestTime: string;
  deaths: string;
  newRecord: string;
  worldMap: string;
  progress: string;
  locked: string;
  masterVolume: string;
  backgroundMusic: string;
  musicVolume: string;
  sfxVolume: string;
  muteAll: string;
  mutedLabel: string;
  unmutedLabel: string;
  graphicsQuality: string;
  screenMode: string;
  windowed: string;
  fullscreen: string;
  controls: string;
  touchControls: string;
  customizeControls: string;
  customizeControlsHint: string;
  saveLayout: string;
  resetToDefault: string;
  customLayoutLabel: string;
  defaultLayoutLabel: string;
  language: string;
  resetProgress: string;
  resetConfirmTitle: string;
  resetConfirmBody: string;
  confirmReset: string;
  cancel: string;
  close: string;
  colorWheel: string;
  doubleJumpUnlocked: string;
  checkpointReached: string;
  colorBlast: string;
  blastReady: string;
  controlHintWasd: string;
  controlHintArrows: string;
  low: string;
  medium: string;
  high: string;
  auto: string;
  on: string;
  off: string;
}

const DICTIONARY: Record<LanguageCode, Translations> = {
  en: {
    subtitle: 'A World Beyond Colors',
    playGame: 'Play Game',
    continueGame: 'Continue',
    newGame: 'New Game',
    levelSelect: 'World Map',
    settings: 'Settings',
    howToPlay: 'How to Play',
    credits: 'Credits',
    resume: 'Resume',
    restartLevel: 'Restart Level',
    mainMenu: 'Main Menu',
    nextLevel: 'Next Level',
    replay: 'Replay',
    paused: 'Paused',
    levelComplete: 'Prism Restored',
    crystals: 'Crystals',
    time: 'Time',
    bestTime: 'Best',
    deaths: 'Falls',
    newRecord: 'New Best',
    worldMap: 'COLORIX Universe',
    progress: 'Progress',
    locked: 'Locked',
    masterVolume: 'Master Volume',
    backgroundMusic: 'Background Music',
    musicVolume: 'Music Volume',
    sfxVolume: 'Sound Effects',
    muteAll: 'Audio Output',
    mutedLabel: 'Muted',
    unmutedLabel: 'Active',
    graphicsQuality: 'Graphics Quality',
    screenMode: 'Screen Mode',
    windowed: 'Windowed',
    fullscreen: 'Fullscreen',
    controls: 'Movement Keys',
    touchControls: 'Touch Controls',
    customizeControls: 'Customize Controls',
    customizeControlsHint: 'Drag any button independently to arrange your layout',
    saveLayout: 'SAVE LAYOUT',
    resetToDefault: 'RESET TO DEFAULT',
    customLayoutLabel: 'Custom',
    defaultLayoutLabel: 'Default',
    language: 'Language',
    resetProgress: 'Reset Progress',
    resetConfirmTitle: 'Reset all progress?',
    resetConfirmBody: 'This clears unlocked worlds, completed levels, crystals, and best times. Your settings will be preserved.',
    confirmReset: 'Reset Everything',
    cancel: 'Cancel',
    close: 'Close',
    colorWheel: '16-Color Wheel',
    doubleJumpUnlocked: 'Double Jump Unlocked',
    checkpointReached: 'Checkpoint Saved',
    colorBlast: 'Color Blast',
    blastReady: 'Ready',
    controlHintWasd: 'A / D Move · Space Jump · X Color Blast · 1–8 / Tab Color · Esc Pause',
    controlHintArrows: '← / → Move · Space Jump · X Color Blast · 1–8 / Tab Color · Esc Pause',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    auto: 'Auto',
    on: 'On',
    off: 'Off',
  },
  es: {
    subtitle: 'Un Mundo Más Allá de los Colores',
    playGame: 'Jugar',
    continueGame: 'Continuar',
    newGame: 'Nueva Partida',
    levelSelect: 'Mapa de Mundos',
    settings: 'Ajustes',
    howToPlay: 'Cómo Jugar',
    credits: 'Créditos',
    resume: 'Reanudar',
    restartLevel: 'Reiniciar Nivel',
    mainMenu: 'Menú Principal',
    nextLevel: 'Siguiente Nivel',
    replay: 'Repetir',
    paused: 'Pausa',
    levelComplete: 'Prisma Restaurado',
    crystals: 'Cristales',
    time: 'Tiempo',
    bestTime: 'Mejor',
    deaths: 'Caídas',
    newRecord: 'Nuevo Récord',
    worldMap: 'Universo COLORIX',
    progress: 'Progreso',
    locked: 'Bloqueado',
    masterVolume: 'Volumen General',
    backgroundMusic: 'Música de Fondo',
    musicVolume: 'Volumen de Música',
    sfxVolume: 'Efectos de Sonido',
    muteAll: 'Salida de Audio',
    mutedLabel: 'Silenciado',
    unmutedLabel: 'Activo',
    graphicsQuality: 'Calidad Gráfica',
    screenMode: 'Pantalla',
    windowed: 'Ventana',
    fullscreen: 'Pantalla Completa',
    controls: 'Teclas de Movimiento',
    touchControls: 'Controles Táctiles',
    customizeControls: 'Personalizar Controles',
    customizeControlsHint: 'Arrastra cada botón de forma independiente',
    saveLayout: 'GUARDAR DISEÑO',
    resetToDefault: 'RESTABLECER',
    customLayoutLabel: 'Personalizado',
    defaultLayoutLabel: 'Predeterminado',
    language: 'Idioma',
    resetProgress: 'Reiniciar Progreso',
    resetConfirmTitle: '¿Reiniciar todo el progreso?',
    resetConfirmBody: 'Esto borrará mundos desbloqueados, niveles completados, cristales y mejores tiempos.',
    confirmReset: 'Borrar Progreso',
    cancel: 'Cancelar',
    close: 'Cerrar',
    colorWheel: 'Rueda de 16 Colores',
    doubleJumpUnlocked: 'Doble Salto Desbloqueado',
    checkpointReached: 'Punto de Control',
    colorBlast: 'Rayo de Color',
    blastReady: 'Listo',
    controlHintWasd: 'A / D Mover · Espacio Saltar · X Rayo · 1–8 / Tab Color · Esc Pausa',
    controlHintArrows: '← / → Mover · Espacio Saltar · X Rayo · 1–8 / Tab Color · Esc Pausa',
    low: 'Baja',
    medium: 'Media',
    high: 'Alta',
    auto: 'Auto',
    on: 'Sí',
    off: 'No',
  },
  fr: {
    subtitle: 'Un Monde Au-Delà des Couleurs',
    playGame: 'Jouer',
    continueGame: 'Continuer',
    newGame: 'Nouvelle Partie',
    levelSelect: 'Carte des Mondes',
    settings: 'Paramètres',
    howToPlay: 'Comment Jouer',
    credits: 'Crédits',
    resume: 'Reprendre',
    restartLevel: 'Recommencer',
    mainMenu: 'Menu Principal',
    nextLevel: 'Niveau Suivant',
    replay: 'Rejouer',
    paused: 'Pause',
    levelComplete: 'Prisme Restauré',
    crystals: 'Cristaux',
    time: 'Temps',
    bestTime: 'Record',
    deaths: 'Chutes',
    newRecord: 'Nouveau Record',
    worldMap: 'Univers COLORIX',
    progress: 'Progression',
    locked: 'Verrouillé',
    masterVolume: 'Volume Principal',
    backgroundMusic: 'Musique de Fond',
    musicVolume: 'Volume Musique',
    sfxVolume: 'Effets Sonores',
    muteAll: 'Sortie Audio',
    mutedLabel: 'Muet',
    unmutedLabel: 'Actif',
    graphicsQuality: 'Qualité Graphique',
    screenMode: 'Mode Écran',
    windowed: 'Fenêtré',
    fullscreen: 'Plein Écran',
    controls: 'Touches de Déplacement',
    touchControls: 'Commandes Tactiles',
    customizeControls: 'Personnaliser les Contrôles',
    customizeControlsHint: 'Faites glisser chaque bouton indépendamment',
    saveLayout: 'ENREGISTRER',
    resetToDefault: 'RÉINITIALISER',
    customLayoutLabel: 'Personnalisé',
    defaultLayoutLabel: 'Par défaut',
    language: 'Langue',
    resetProgress: 'Réinitialiser',
    resetConfirmTitle: 'Réinitialiser la progression ?',
    resetConfirmBody: 'Cela efface les mondes débloqués, niveaux terminés, cristaux et records.',
    confirmReset: 'Tout Effacer',
    cancel: 'Annuler',
    close: 'Fermer',
    colorWheel: 'Roue des 16 Couleurs',
    doubleJumpUnlocked: 'Double Saut Débloqué',
    checkpointReached: 'Point de Passage',
    colorBlast: 'Éclat de Couleur',
    blastReady: 'Prêt',
    controlHintWasd: 'A / D Déplacer · Espace Sauter · X Éclat · 1–8 / Tab Couleur · Échap Pause',
    controlHintArrows: '← / → Déplacer · Espace Sauter · X Éclat · 1–8 / Tab Couleur · Échap Pause',
    low: 'Bas',
    medium: 'Moyen',
    high: 'Élevé',
    auto: 'Auto',
    on: 'Activé',
    off: 'Désactivé',
  },
};

export function getStrings(lang: LanguageCode): Translations {
  return DICTIONARY[lang] ?? DICTIONARY.en;
}
