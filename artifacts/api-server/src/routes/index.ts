import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai/index";
import shopifyRouter from "./shopify/index";
const router: IRouter = Router();

router.use(healthRouter);
router.use(openaiRouter);
router.use(shopifyRouter);

export default router;
