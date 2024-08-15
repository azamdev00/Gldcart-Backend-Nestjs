import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { EmailService } from '@email/services/email.service';
import { InventoryService } from '@inventory/services/inventory.service';
import { CreateOrderDto } from '@order/dto/create-order.dto';
import { OrderStatus } from '@order/enums/order-status.enum';
import { Order, OrderDocument } from '@order/schemas/order.schema';
import { StripeService } from '@stripe/services/stripe.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  public constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly inventoryService: InventoryService,
    private readonly emailService: EmailService,
    private readonly stripeService: StripeService,
  ) {}

  public async placeOrder(order: CreateOrderDto, stripeCustomerId: string) {
    this.logger.log(
      `Placing order for customer ${stripeCustomerId} with amount ${order.amount}`,
    );
    const newOrder = await this.createOrder(order);

    const paymentIntent = await this.stripeService.createPaymentIntent(
      order.amount,
      { order_id: newOrder._id.toString() },
      stripeCustomerId,
    );

    this.logger.log(
      `Order placed successfully for customer ${stripeCustomerId}`,
    );
    return { client_secret: paymentIntent.client_secret };
  }

  private async createOrder(order: CreateOrderDto): Promise<OrderDocument> {
    this.logger.log(`Creating new order`);
    const newOrder = new this.orderModel(order);
    await newOrder.save();
    this.logger.log(`Order created with ID: ${newOrder._id}`);
    return newOrder;
  }

  public async getOrderWithItemsById(orderId: string): Promise<Order> {
    this.logger.log(`Fetching order with ID: ${orderId}`);
    const order = await this.orderModel
      .findById(orderId)
      .populate('items.id')
      .lean();

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    this.logger.log(`Order with ID ${orderId} fetched successfully`);
    return order;
  }

  public async processOrder(
    orderId: string,
    status: OrderStatus,
  ): Promise<void> {
    this.logger.log(
      `Processing order with ID: ${orderId} to status: ${status}`,
    );
    const session = await this.orderModel.db.startSession();
    session.startTransaction();
    try {
      const order = await this.updateOrder(orderId, { status }, session);
      await this.updateInventory(order.items, session);
      await session.commitTransaction();
      this.logger.log(`Order with ID ${orderId} processed successfully`);
      await this.emailService.sendOrderConfirmationEmail(order);
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(
        `Failed to process order with ID: ${orderId}`,
        error.stack,
      );
      throw error;
    } finally {
      session.endSession();
    }
  }

  private async updateOrder(
    orderId: string,
    data: Partial<OrderDocument>,
    session: ClientSession,
  ): Promise<Order> {
    this.logger.log(`Updating order with ID: ${orderId}`);
    const order = await this.orderModel.findOneAndUpdate(
      { _id: orderId },
      data,
      { new: true, session },
    );

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    this.logger.log(`Order with ID ${orderId} updated successfully`);
    return order;
  }

  private async updateInventory(
    items: any[],
    session: ClientSession,
  ): Promise<void> {
    this.logger.log(`Updating inventory for items`);
    await this.inventoryService.updateInventory(items, session);
  }
}
