import type {
  CategoriesResponse,
  CategoryResponse,
  CategoryWrittenResponse,
} from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { CategoryService } from '../services/category-service.js';
import { required } from './fields.js';

/** A slug as an address carries it. Anything else is not a Category and is told so as a 404. */
const slugParams = z.object({ slug: z.string().trim().min(1) });
const categoryIdParams = z.object({ categoryId: z.uuid('That is not a Category id.') });

/** Reads `CategoryNameRequest`. Trimmed; the spelling inside is the Administrator's. */
const nameBody = z.object({ name: required('A Category needs a name') });

export interface CategoryController {
  list: RequestHandler;
  read: RequestHandler;
  add: RequestHandler;
  rename: RequestHandler;
}

export function createCategoryController(dependencies: {
  categoryService: CategoryService;
}): CategoryController {
  const { categoryService } = dependencies;

  return {
    list: async (_request, response) => {
      const body: CategoriesResponse = await categoryService.list();
      response.json(body);
    },

    read: async (request, response) => {
      const { slug } = slugParams.parse(request.params);
      const body: CategoryResponse = await categoryService.read(slug);
      response.json(body);
    },

    add: async (request, response) => {
      const { name } = nameBody.parse(request.body);
      const body: CategoryWrittenResponse = { category: await categoryService.add(name) };
      response.status(201).json(body);
    },

    rename: async (request, response) => {
      const { categoryId } = categoryIdParams.parse(request.params);
      const { name } = nameBody.parse(request.body);
      const body: CategoryWrittenResponse = {
        category: await categoryService.rename(categoryId, name),
      };
      response.json(body);
    },
  };
}
