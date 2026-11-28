export function missingColumn(
  error: { code: string; message: string } | null,
  column: string,
) {
  return (
    !!error &&
    ["42703", "PGRST204"].includes(error.code) &&
    error.message.includes(column)
  );
}
