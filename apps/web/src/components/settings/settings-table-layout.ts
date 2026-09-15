export interface AdaptiveSettingsTableColumn {
  header: string;
  values?: readonly (string | null | undefined)[];
  minWidth: number;
  maxWidth: number;
}

export interface AdaptiveSettingsTableLayout {
  gridTemplateColumns: string;
  maxWidth: number;
  columnWidths: number[];
}

const CELL_HORIZONTAL_PADDING = 32;
const COLUMN_GAP = 16;
const EDIT_HANDLE_WIDTH = 24;
const EDIT_ACTION_WIDTH = 72;
const APPROXIMATE_CHARACTER_WIDTH = 7.4;
export const SETTINGS_TABLE_STANDARD_WIDTH = 1120;
const EDIT_MODE_WIDTH_INCREMENT = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateColumnWidth(column: AdaptiveSettingsTableColumn): number {
  const longestText = [column.header, ...(column.values ?? [])].reduce(
    (longest, value) => Math.max(longest, value?.trim().length ?? 0),
    0,
  );

  return Math.ceil(
    clamp(
      longestText * APPROXIMATE_CHARACTER_WIDTH + CELL_HORIZONTAL_PADDING,
      column.minWidth,
      column.maxWidth,
    ),
  );
}

/**
 * Gives Settings data tables a content-driven width without introducing a
 * viewport-breaking minimum width. Visible data columns share the resulting
 * surface equally, while edit-only handle/action columns expand the envelope
 * only for the duration of editing.
 */
export function getAdaptiveSettingsTableLayout({
  columns,
  isEditing,
  availableWidth = 1120,
}: {
  columns: readonly AdaptiveSettingsTableColumn[];
  isEditing: boolean;
  availableWidth?: number;
}): AdaptiveSettingsTableLayout {
  const safeAvailableWidth = Math.max(0, availableWidth);
  const columnWidths = columns.map(estimateColumnWidth);
  const editColumnCount = isEditing ? 2 : 0;
  const totalColumnCount = columns.length + editColumnCount;
  const gaps = Math.max(0, totalColumnCount - 1) * COLUMN_GAP;
  const editChrome = isEditing ? EDIT_HANDLE_WIDTH + EDIT_ACTION_WIDTH : 0;
  const contentWidth =
    columnWidths.reduce((total, width) => total + width, 0) +
    editChrome +
    gaps +
    CELL_HORIZONTAL_PADDING;
  const modeMinimum = SETTINGS_TABLE_STANDARD_WIDTH + (isEditing ? EDIT_MODE_WIDTH_INCREMENT : 0);
  const maxWidth = Math.min(safeAvailableWidth, Math.max(modeMinimum, contentWidth));
  const contentTracks = columns.map(() => "minmax(0, 1fr)").join(" ");

  return {
    columnWidths,
    maxWidth,
    gridTemplateColumns: isEditing
      ? `${EDIT_HANDLE_WIDTH}px ${contentTracks} ${EDIT_ACTION_WIDTH}px`
      : contentTracks,
  };
}
