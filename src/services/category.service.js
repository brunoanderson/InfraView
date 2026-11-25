// Categorias da tela Rede e do dashboard.
import * as categoryModel from '../models/category.model.js';

/** Categorias com a contagem de dispositivos por situação. */
export const list = () => categoryModel.listWithCounts();
