import { IsISO8601 } from 'class-validator';

export class PostponeFinancialEventDto {
  @IsISO8601()
  date!: string;
}
