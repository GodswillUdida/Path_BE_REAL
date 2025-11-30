import axios from 'axios';
import crypto from 'crypto';

export const initiatePaystackPayment = async ({ email, amount, enrollmentId }: any) => {
    const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        {
            email,
            amount: amount * 100,
            metadata: { enrollmentId },
            callback_url: `${process.env.FRONTEND_URL}/payment-success`,
        },
        {
            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` },
        }
    );
    return response.data.data.authorization_url;
};

export const validatePaystackWebhook = (req: any) => {
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET!)
        .update(req.body)
        .digest('hex');
    return hash === req.headers['x-paystack-signature'];
};
