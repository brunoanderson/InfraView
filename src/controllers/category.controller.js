// Controller de categorias.
import * as categoryModel from '../models/category.model.js';

/** GET /api/categories (com contagem de dispositivos) */
export function list(req, res) {
    res.json({ categories: categoryModel.listWithCounts() });
}
