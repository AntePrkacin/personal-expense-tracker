import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  // Normalized here rather than in the database: SQLite could do it with
  // `COLLATE NOCASE`, but Drizzle's column builder cannot express that, so the
  // unique index only holds if every write goes in already lowercased.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /** Major units (e.g. 2000.50). Stored as integer cents. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monthlyBudget!: number;

  /** Capped at 28 so the day exists in every month. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  monthStartDay?: number;
}
