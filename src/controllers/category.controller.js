// Controller de categorias.
import * as categoryService from '../services/category.service.js';

/** GET /api/categories (com contagem de dispositivos) */
export function list(req, res) {
    res.json({ categories: categoryService.list() });
}
