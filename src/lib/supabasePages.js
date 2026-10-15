export const fetchAllSupabaseRows = async (client, table, columns, orders, pageSize = 500) => {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from(table).select(columns);
    for (const [column, ascending] of orders) query = query.order(column, { ascending });
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
};
