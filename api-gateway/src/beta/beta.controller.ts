import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';
import { Pool } from 'pg';

@Controller('beta')
export class BetaController {
  private readonly pool: Pool;
  
  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  @Post('waitlist')
  async joinWaitlist(@Body('email') email: string) {
    if (!email) return { success: false, error: 'Email is required' };
    try {
      await this.pool.query('INSERT INTO waitlist_entries (email) VALUES ($1) ON CONFLICT DO NOTHING', [email]);
      return { success: true, message: 'Joined waitlist successfully' };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  @Post('invite/verify')
  async verifyInvite(@Body('code') code: string) {
    const res = await this.pool.query('SELECT id, used FROM invites WHERE code = $1', [code]);
    if (res.rows.length === 0) return { valid: false, error: 'Invalid code' };
    if (res.rows[0].used) return { valid: false, error: 'Code already used' };
    return { valid: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('feedback')
  async submitFeedback(@Req() req: Request, @Body() body: { type: string, content: string }) {
    const userId = (req.user as any).id;
    try {
      await this.pool.query('INSERT INTO user_feedbacks (user_id, type, content) VALUES ($1, $2, $3)', [userId, body.type, body.content]);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}
