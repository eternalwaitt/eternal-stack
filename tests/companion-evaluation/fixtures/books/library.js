export const STATUSES = ['Want to read', 'Reading', 'Finished'];

export async function readBooks(file) {
  // TODO: read and validate persisted books; a missing file means an empty list.
  return [];
}

export async function addBook(file, input) {
  // TODO: persist and return the created book.
  throw new Error('not implemented');
}

export async function updateBook(file, id, changes) {
  // TODO: update title, author, and/or status; reject unknown books/statuses.
  throw new Error('not implemented');
}

export async function removeBook(file, id) {
  // TODO: remove by id and persist the result.
  throw new Error('not implemented');
}
