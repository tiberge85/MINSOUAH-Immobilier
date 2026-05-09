import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private config: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length > 0) return;
    try {
      const serviceAccount = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
      if (serviceAccount) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccount)),
          storageBucket: this.config.get<string>('FIREBASE_STORAGE_BUCKET'),
        });
        this.logger.log('Firebase Admin initialized');
      } else {
        this.logger.warn('FIREBASE_SERVICE_ACCOUNT not set — Firebase Admin disabled');
      }
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin', err);
    }
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken | null> {
    try {
      return await admin.auth().verifyIdToken(idToken);
    } catch {
      return null;
    }
  }

  async getUserByEmail(email: string) {
    try {
      return await admin.auth().getUserByEmail(email);
    } catch {
      return null;
    }
  }

  async createFirebaseUser(email: string, password: string, displayName?: string) {
    return admin.auth().createUser({ email, password, displayName });
  }

  async setCustomClaims(uid: string, claims: Record<string, unknown>) {
    await admin.auth().setCustomUserClaims(uid, claims);
  }

  async sendNotification(token: string, notification: { title: string; body: string }, data?: Record<string, string>) {
    try {
      await admin.messaging().send({ token, notification, data: data || {} });
    } catch (err) {
      this.logger.warn(`Push notification failed: ${err.message}`);
    }
  }

  get bucket() {
    return admin.apps.length ? admin.storage().bucket() : null;
  }
}
