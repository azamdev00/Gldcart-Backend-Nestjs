import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cart, CartDocument } from '@cart/schemas/cart.schema';
import { CreateItemDto } from '@item/dto/create-item.dto';
import { ICartService } from '@cart/iterfaces/cart.service.interface';
import { UpdateItemDto } from '@item/dto/update-item.dto';
import { AddShippingOptionsDto } from '@shipping/dtos/add-shipping-option.dto';
import { RemoveShippingOptionDto } from '@shipping/dtos/remove-shipping-option.dto';

@Injectable()
export class CartService implements ICartService {
  public constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
  ) {}

  public async getById(id: string): Promise<Cart> {
    const cart = await this.cartModel.findById(id);
    if (!cart) {
      throw new NotFoundException(`Cart with ID ${id} not found`);
    }
    return cart;
  }

  public async getWithItemsById(id: string): Promise<Cart> {
    const cart = await this.cartModel.findById(id).populate('items.id');
    if (!cart) {
      throw new NotFoundException(`Cart with ID ${id} not found`);
    }
    return cart;
  }

  public async getWithItemsByUserId(userId: string): Promise<Cart> {
    const cart = await this.cartModel
      .findOne({ customer: userId })
      .populate('items.id');
    if (!cart) {
      throw new NotFoundException(`No carts found for user with id ${userId}`);
    }
    return cart;
  }

  public async addItem(userId: string, newItem: CreateItemDto): Promise<Cart> {
    const existingCart = await this.cartModel.findOne({ customer: userId });
    if (!existingCart) {
      return this.createWithItem(userId, newItem);
    } else {
      return this.addItemToExisting(existingCart, newItem);
    }
  }

  public async updateItem(
    id: string,
    updateItem: CreateItemDto,
  ): Promise<Cart> {
    const existingCart = await this.getByIdOrThrow(id);

    const itemIndex = existingCart.items.findIndex(
      (item) => item.id.toString() === updateItem.id,
    );

    if (itemIndex === -1) {
      throw new NotFoundException(
        `Item with ID ${updateItem.id} not found in cart`,
      );
    }

    existingCart.items[itemIndex] = updateItem;

    return existingCart.save();
  }

  public async removeItem(id: string, itemId: string): Promise<Cart> {
    const existingCart = await this.getByIdOrThrow(id);
    const itemIndex = existingCart.items.findIndex(
      (item) => item.id.toString() === itemId,
    );
    if (itemIndex === -1) {
      throw new NotFoundException(`Item with ID ${id} not found in cart`);
    }
    existingCart.items.splice(itemIndex, 1);
    return existingCart.save();
  }

  public async updateItemQuantity(
    id: string,
    itemId: string,
    updateItem: UpdateItemDto,
  ): Promise<Cart> {
    const existingCart = await this.getByIdOrThrow(id);

    const item = existingCart.items.find((i) => i.id.toString() === itemId);

    if (!item) {
      throw new NotFoundException(`Item with ID ${itemId} not found in cart`);
    }

    item.quantity = updateItem.quantity;

    return existingCart.save();
  }

  public async addShippingOption(
    id: string,
    shippingOption: AddShippingOptionsDto,
  ): Promise<Cart> {
    const cart = await this.getByIdOrThrow(id);

    const newShippingOptions = shippingOption.shipping.filter(
      (option) => !cart.shipping.includes(option),
    );

    cart.shipping.push(...newShippingOptions);

    return cart.save();
  }

  public async removeShippingOption(
    id: string,
    shippingOption: RemoveShippingOptionDto,
  ) {
    const cart = await this.getByIdOrThrow(id);

    const index = cart.shipping.indexOf(shippingOption.shipping);
    if (index > -1) {
      cart.shipping.splice(index, 1);
    } else {
      throw new NotFoundException(
        `Shipping option ${shippingOption.shipping} not found in cart`,
      );
    }

    return cart.save();
  }

  public async remove(id: string): Promise<{ message: string }> {
    const result = await this.cartModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException(`Cart with ID ${id} not found`);
    }
    return { message: 'Cart deleted successfully' };
  }

  private async getByIdOrThrow(id: string): Promise<CartDocument> {
    const cart = await this.cartModel.findById(id);
    if (!cart) {
      throw new NotFoundException(`Cart with ID ${id} not found`);
    }

    return cart;
  }

  private createWithItem(
    userId: string,
    newItem: CreateItemDto,
  ): Promise<Cart> {
    const cart = new this.cartModel({
      customer: userId,
      items: [newItem],
    });

    return cart.save();
  }

  private addItemToExisting(
    existingCart: CartDocument,
    newItem: CreateItemDto,
  ): Promise<Cart> {
    const itemExists = existingCart.items.some(
      (item) => item.id.toString() === newItem.id,
    );
    if (!itemExists) {
      existingCart.items.push(newItem);
    }

    return existingCart.save();
  }
}
